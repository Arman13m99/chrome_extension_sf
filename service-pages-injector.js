// SnappFood Service Pages Injector - Phase 2
// --- Globals ---
let pairedVendors = new Set();
let hotRecommendations = new Set();
let processedVendors = new Set();

// --- Helper Functions ---
function isServicePage() {
    return window.location.pathname.includes('/service/') && window.location.pathname.includes('/city/');
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
    
    // Try data attributes that might contain vendor codes
    const vendorCode = element.dataset?.vendorCode || 
                      element.dataset?.code || 
                      element.dataset?.vendorId ||
                      element.getAttribute('data-vendor-code');
    if (vendorCode) return vendorCode;
    
    // Check if there's a link as direct child or descendant
    const directLink = element.querySelector('a[href*="/restaurant/menu/"]');
    if (directLink) {
        return extractVendorCodeFromUrl(directLink.href);
    }
    
    return null;
}

function extractRatingFromElement(element) {
    // Look for rating in various text elements and classes
    const ratingSelectors = [
        '[class*="rating"]',
        '[class*="score"]', 
        '[data-testid*="rating"]',
        '.rating',
        '.score'
    ];
    
    for (const selector of ratingSelectors) {
        const ratingElements = element.querySelectorAll(selector);
        for (const ratingEl of ratingElements) {
            const ratingText = ratingEl.textContent.trim();
            const rating = parseFloat(ratingText);
            if (rating && !isNaN(rating) && rating >= 0 && rating <= 10) {
                return rating;
            }
        }
    }
    
    // Try to find in any text content that looks like a rating
    const textContent = element.textContent;
    const ratingPatterns = [
        /(\d+\.?\d*)\s*(?:از\s*\d+|\/\d+|★)/g,
        /rating[:\s]*(\d+\.?\d*)/gi,
        /امتیاز[:\s]*(\d+\.?\d*)/g
    ];
    
    for (const pattern of ratingPatterns) {
        const matches = textContent.match(pattern);
        if (matches) {
            for (const match of matches) {
                const ratingMatch = match.match(/(\d+\.?\d*)/);
                if (ratingMatch) {
                    const rating = parseFloat(ratingMatch[1]);
                    if (rating >= 0 && rating <= 10) return rating;
                }
            }
        }
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
        
        console.log(`Service Pages: Added hot recommendation for vendor ${vendorCode} (rating: ${rating})`);
    } else if (isPaired) {
        vendorElement.classList.add('sp-vs-tp-vendor-paired');
        console.log(`Service Pages: Highlighted paired vendor ${vendorCode}`);
    }
}

function processVendorElements() {
    // Service pages typically show vendor cards in a list format
    const vendorSelectors = [
        // Vendor list items
        '[data-testid*="vendor"]',
        '[class*="vendor"]',
        // Restaurant cards
        '[class*="restaurant"]',
        // General list items that might be vendor cards
        'li[class*="item"]',
        'article',
        '.card',
        '[class*="card"]',
        // Divs that contain restaurant menu links
        'div:has(a[href*="/restaurant/menu/"])',
        // Any container with vendor links
        '*:has(> a[href*="/restaurant/menu/"])'
    ];
    
    // Also directly process links and find their containers
    const vendorLinks = document.querySelectorAll('a[href*="/restaurant/menu/"]');
    vendorLinks.forEach(link => {
        const vendorCode = extractVendorCodeFromUrl(link.href);
        if (vendorCode) {
            // Find the appropriate container to highlight (usually a card or list item)
            const container = link.closest('article, li, .card, [class*="card"], [class*="vendor"], [class*="restaurant"], div[class*="item"]') || 
                            link.parentElement;
            
            if (container) {
                const rating = extractRatingFromElement(container);
                highlightVendor(container, vendorCode, rating);
            }
        }
    });
    
    // Process other potential vendor containers
    vendorSelectors.forEach(selector => {
        try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                const vendorCode = extractVendorCodeFromElement(element);
                if (vendorCode) {
                    const rating = extractRatingFromElement(element);
                    highlightVendor(element, vendorCode, rating);
                }
            });
        } catch (e) {
            // Some selectors might not be valid in all browsers, skip them
            console.debug(`Service Pages: Skipping selector ${selector}:`, e);
        }
    });
}

function fetchPairedVendors() {
    // Get list of paired vendors from our background script
    chrome.runtime.sendMessage({ action: "getVendorList" }, (response) => {
        if (chrome.runtime.lastError) {
            console.warn("Service Pages: Chrome messaging error:", chrome.runtime.lastError.message);
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
            
            console.log(`Service Pages: Loaded ${pairedVendors.size} paired vendors`);
            
            // Process existing elements
            processVendorElements();
            
            // Set up observer for dynamic content (pagination, infinite scroll, etc.)
            setupContentObserver();
        } else {
            console.error("Service Pages: Failed to load paired vendors:", response?.error);
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
                            node.querySelector('.sc-citwmv') ||
                            node.classList?.contains('VendorCard__VendorBox-sc-6qaz7-0') ||
                            node.classList?.contains('VendorCard__HtmlLink-sc-6qaz7-4') ||
                            node.classList?.contains('sc-citwmv') ||
                            extractVendorCodeFromElement(node)
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
            clearTimeout(window.servicePageProcessTimeout);
            window.servicePageProcessTimeout = setTimeout(processVendorElements, 500);
        }
    });
    
    // Observe the main content area
    const targetNode = document.getElementById('__next') || document.body;
    observer.observe(targetNode, {
        childList: true,
        subtree: true
    });
    
    console.log("Service Pages: Content observer setup complete");
}

// --- Main Execution Logic ---
function run() {
    if (!isServicePage()) {
        console.log("Service Pages: Not on a service page, skipping injection");
        return;
    }
    
    console.log("Service Pages: SnappFood service page detected, starting vendor highlighting");
    console.log("Service Pages: Current URL:", window.location.href);
    
    // Add some test data for debugging (will be overridden by API if available)
    if (window.location.href.includes('mashhad')) {
        console.log("Service Pages: Adding test data for Mashhad");
        pairedVendors.add('12jzj7'); // Your test vendor
        console.log("Service Pages: Added test data - paired vendors:", pairedVendors.size);
    }
    
    // Wait a bit for the page to load, then fetch paired vendors
    setTimeout(() => {
        fetchPairedVendors();
    }, 1000);
}

// Start the script
run();