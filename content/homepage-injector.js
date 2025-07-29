// SnappFood Homepage Injector - Phase 2
// --- Globals ---
let pairedVendors = new Set();
let hotRecommendations = new Set();
let processedVendors = new Set();

// --- Helper Functions ---
function isHomepage() {
    return window.location.pathname === '/' || window.location.pathname === '';
}

function extractVendorCodeFromUrl(url) {
    if (!url) return null;
    const match = url.match(/-r-([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
}

function extractVendorCodeFromElement(element) {
    // Try to find vendor code in various places
    const links = element.querySelectorAll('a[href*="/restaurant/menu/"]');
    for (const link of links) {
        const code = extractVendorCodeFromUrl(link.href);
        if (code) return code;
    }
    
    // Try data attributes
    const vendorCode = element.dataset?.vendorCode || element.dataset?.code;
    if (vendorCode) return vendorCode;
    
    return null;
}

function extractRatingFromElement(element) {
    // Look for rating in various text elements
    const ratingElements = element.querySelectorAll('[class*="rating"], [class*="score"], .rating, .score');
    for (const ratingEl of ratingElements) {
        const rating = parseFloat(ratingEl.textContent);
        if (rating && !isNaN(rating)) return rating;
    }
    
    // Try to find in any text content that looks like a rating
    const textContent = element.textContent;
    const ratingMatch = textContent.match(/(\d+\.?\d*)\s*(?:از|\/|★)/);
    if (ratingMatch) {
        const rating = parseFloat(ratingMatch[1]);
        if (rating >= 0 && rating <= 10) return rating;
    }
    
    return null;
}

function createRecommendationBadge() {
    const badge = document.createElement('div');
    badge.className = 'sp-vs-tp-recommendation-badge';
    badge.textContent = 'پیشنهاد ویژه';
    return badge;
}

function highlightVendor(vendorElement, vendorCode, rating) {
    if (processedVendors.has(vendorCode)) return;
    processedVendors.add(vendorCode);
    
    const isPaired = pairedVendors.has(vendorCode);
    const isHotRecommendation = rating && rating > 9.2;
    
    if (isHotRecommendation) {
        vendorElement.classList.add('sp-vs-tp-vendor-hot-recommendation');
        
        // Add recommendation badge
        const badge = createRecommendationBadge();
        vendorElement.style.position = 'relative';
        vendorElement.appendChild(badge);
        
        console.log(`Homepage: Added hot recommendation for vendor ${vendorCode} (rating: ${rating})`);
    } else if (isPaired) {
        vendorElement.classList.add('sp-vs-tp-vendor-paired');
        console.log(`Homepage: Highlighted paired vendor ${vendorCode}`);
    }
}

function processVendorElements() {
    // Homepage has multiple sections with vendors, we need to find all possible vendor containers
    const vendorSelectors = [
        // Product cards with vendor info
        '[data-testid*="product"], [class*="product"]',
        // Vendor cards
        '[data-testid*="vendor"], [class*="vendor"]',
        // Restaurant cards
        '[class*="restaurant"]',
        // General cards that might contain vendor links
        'article, .card, [class*="card"]',
        // Any element with restaurant menu links
        'a[href*="/restaurant/menu/"]'
    ];
    
    vendorSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
            const vendorCode = extractVendorCodeFromElement(element);
            if (vendorCode) {
                const rating = extractRatingFromElement(element);
                
                // Find the appropriate container to highlight
                let containerToHighlight = element;
                
                // If this is just a link, find its parent card
                if (element.tagName === 'A') {
                    containerToHighlight = element.closest('article, .card, [class*="card"], [class*="product"], [class*="vendor"]') || element.parentElement;
                }
                
                highlightVendor(containerToHighlight, vendorCode, rating);
            }
        });
    });
}

function fetchPairedVendors() {
    // Get list of paired vendors from our background script
    chrome.runtime.sendMessage({ action: "getVendorList" }, (response) => {
        if (chrome.runtime.lastError) {
            console.warn("Homepage: Chrome messaging error:", chrome.runtime.lastError.message);
            
            // Continue without paired vendors if API fails
            setTimeout(() => {
                processVendorElements();
                setupContentObserver();
            }, 1000);
            return;
        }
        
        if (response && response.success) {
            // Extract all SF vendor codes from the response
            if (response.vendors && Array.isArray(response.vendors)) {
                response.vendors.forEach(vendor => {
                    if (vendor.sf_code) {
                        pairedVendors.add(vendor.sf_code);
                    }
                });
            }
            
            console.log(`Homepage: Loaded ${pairedVendors.size} paired vendors`);
            
            // Process existing elements
            processVendorElements();
            
            // Set up observer for dynamic content
            setupContentObserver();
        } else {
            console.error("Homepage: Failed to load paired vendors:", response?.error);
            
            // Continue without paired vendors
            setTimeout(() => {
                processVendorElements();
                setupContentObserver();
            }, 1000);
        }
    });
}

function setupContentObserver() {
    const observer = new MutationObserver((mutations) => {
        let shouldProcess = false;
        
        mutations.forEach(mutation => {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                // Check if any added nodes contain vendor elements
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Check if the node itself or its children contain SnappFood vendor cards
                        const hasVendorContent = node.querySelector && (
                            node.querySelector('.VendorCard__VendorBox-sc-6qaz7-0') ||
                            node.querySelector('a.VendorCard__HtmlLink-sc-6qaz7-4') ||
                            node.querySelector('a[href*="/restaurant/menu/"]') ||
                            node.classList?.contains('VendorCard__VendorBox-sc-6qaz7-0') ||
                            node.classList?.contains('VendorCard__HtmlLink-sc-6qaz7-4')
                        );
                        
                        if (hasVendorContent) {
                            shouldProcess = true;
                        }
                    }
                });
            }
        });
        
        if (shouldProcess) {
            // Debounce processing to avoid excessive calls
            clearTimeout(window.homepageProcessTimeout);
            window.homepageProcessTimeout = setTimeout(processVendorElements, 500);
        }
    });
    
    // Observe the main content area
    const targetNode = document.getElementById('__next') || document.body;
    observer.observe(targetNode, {
        childList: true,
        subtree: true
    });
    
    console.log("Homepage: Content observer setup complete");
}

// --- Main Execution Logic ---
function run() {
    if (!isHomepage()) {
        console.log("Homepage: Not on homepage, skipping injection");
        return;
    }
    
    console.log("Homepage: SnappFood homepage detected, starting vendor highlighting");
    
    // Wait a bit for the page to load, then fetch paired vendors
    setTimeout(() => {
        fetchPairedVendors();
    }, 1000);
}

// Start the script
run();