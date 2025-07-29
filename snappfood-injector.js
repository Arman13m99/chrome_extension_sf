// Dynamic SnappFood Injector - Enhanced with new features
// --- Globals ---
let comparisonData = {};
let vendorInfo = {};
let allProductElements = new Set();

// --- Helper Functions ---
function getVendorCodeFromUrl(url) {
    const match = url.match(/-r-([a-zA-Z0-9]+)\/?/);
    return match ? match[1] : null;
}

function formatPrice(amount) {
    return new Intl.NumberFormat('fa-IR').format(amount);
}

function normalizeText(text) {
    // Basic normalization for matching titles
    return text.trim().replace(/\s+/g, ' ');
}

function generateTapsiFoodUrl(tfCode) {
    return `https://tapsi.food/vendor/${tfCode}`;
}

function openOtherPlatform() {
    if (vendorInfo.tf_code) {
        const url = generateTapsiFoodUrl(vendorInfo.tf_code);
        window.open(url, '_blank');
    }
}

// --- UI Injection ---
function injectComparison(productCard) {
    // Track all product elements
    allProductElements.add(productCard);
    
    // Heuristic matching by product title
    const titleElement = productCard.querySelector('h2.sc-hKgILt.esHHju');
    if (!titleElement) return;
    
    const cardTitle = normalizeText(titleElement.textContent);
    
    // Find the product ID by title from our fetched data
    let matchedProductId = null;
    for (const id in comparisonData) {
        if (normalizeText(comparisonData[id].baseProduct.name) === cardTitle) {
            matchedProductId = id;
            break;
        }
    }
    
    if (!matchedProductId || !comparisonData[matchedProductId]) {
        // This is an unpaired product
        if (!productCard.classList.contains('sp-vs-tp-unpaired')) {
            productCard.classList.add('sp-vs-tp-unpaired');
        }
        return;
    }
    
    const data = comparisonData[matchedProductId];
    if (productCard.querySelector('.sp-vs-tp-comparison-text')) return; // Already injected
    
    const priceElement = productCard.querySelector('span.sc-hKgILt.hxREoh');
    if (!priceElement) return;
    
    let text, className;
    const absDiff = formatPrice(Math.abs(data.priceDiff));
    
    // Enhanced text with discount information
    let discountNote = '';
    if (data.baseProduct.discountRatio > 0 || data.counterpartProduct.discountRatio > 0) {
        discountNote = ' (قیمت نهایی)';
    }
    
    // Handle same price products
    if (data.priceDiff === 0) {
        text = `سفارش از تپسی‌فود (پیک رایگان)${discountNote}`;
        className = 'sp-vs-tp-same-price';
    }
    // Fixed logic: when priceDiff > 0, SnappFood (base) is more expensive than TapsiFood (counterpart)
    else if (data.priceDiff > 0) {
        // SnappFood is more expensive, TapsiFood is cheaper
        text = `${data.percentDiff}% ارزان‌تر در تپسی‌فود (${absDiff} تومان کمتر)${discountNote}`;
        className = 'sp-vs-tp-cheaper';
    } else if (data.priceDiff < 0) {
        // SnappFood is cheaper, TapsiFood is more expensive
        text = `${data.percentDiff}% گران‌تر در تپسی‌فود (${absDiff} تومان بیشتر)${discountNote}`;
        className = 'sp-vs-tp-expensive';
    }
    
    productCard.classList.add(className);
    
    const comparisonDiv = document.createElement('div');
    comparisonDiv.className = `sp-vs-tp-comparison-text ${className}`;
    comparisonDiv.textContent = text;
    comparisonDiv.style.fontFamily = "'IRANSansMobile', 'Vazirmatn', sans-serif";
    
    // Add click handler to open other platform
    comparisonDiv.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openOtherPlatform();
    });
    
    // Add click handler to product card as well
    productCard.addEventListener('click', (e) => {
        // Only trigger if clicking on the border area, not on buttons or other interactive elements
        if (e.target === productCard || e.target.classList.contains('sp-vs-tp-comparison-text')) {
            e.preventDefault();
            e.stopPropagation();
            openOtherPlatform();
        }
    });
    
    // Insert above the price
    priceElement.parentElement.insertBefore(comparisonDiv, priceElement);
}

function injectFloatingWidget() {
    if (document.getElementById('sp-vs-tp-widget-icon') || document.getElementById('sp-vs-tp-widget-container')) return;
    
    // Create the floating icon
    const iconHTML = `
        <div id="sp-vs-tp-widget-icon" title="مقایسه قیمت محصولات">
            🔍
        </div>
    `;
    
    // Create the enhanced widget with dynamic restaurant name (removed close/minimize buttons)
    const restaurantName = vendorInfo.sf_name || 'رستوران';
    const widgetHTML = `
        <div id="sp-vs-tp-widget-container">
            <div id="sp-vs-tp-widget-header">
                <span>مقایسه قیمت - ${restaurantName}</span>
            </div>
            <div id="sp-vs-tp-widget-body">
                <input type="text" id="sp-vs-tp-search-input" placeholder="جستجوی محصول..." />
                <ul id="sp-vs-tp-search-results">
                    <li>برای جستجو، نام محصول را وارد کنید.</li>
                </ul>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', iconHTML);
    document.body.insertAdjacentHTML('beforeend', widgetHTML);
    
    // Get elements
    const icon = document.getElementById('sp-vs-tp-widget-icon');
    const widget = document.getElementById('sp-vs-tp-widget-container');
    const header = document.getElementById('sp-vs-tp-widget-header');
    const searchInput = document.getElementById('sp-vs-tp-search-input');
    
    // Icon click to toggle widget
    icon.addEventListener('click', () => {
        widget.classList.toggle('show');
        if (widget.classList.contains('show')) {
            searchInput.focus();
        }
    });
    
    // Drag functionality
    let isDragging = false;
    let offsetX, offsetY;
    
    header.addEventListener('mousedown', (e) => {
        isDragging = true;
        offsetX = e.clientX - widget.offsetLeft;
        offsetY = e.clientY - widget.offsetTop;
        widget.style.cursor = 'grabbing';
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        widget.style.left = `${e.clientX - offsetX}px`;
        widget.style.top = `${e.clientY - offsetY}px`;
    });
    
    document.addEventListener('mouseup', () => {
        isDragging = false;
        widget.style.cursor = 'default';
    });
    
    // Enhanced search functionality with corrected logic
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const resultsList = document.getElementById('sp-vs-tp-search-results');
        resultsList.innerHTML = '';
        
        if (query.length < 2) {
            resultsList.innerHTML = '<li>برای جستجو، نام محصول را وارد کنید.</li>';
            return;
        }
        
        const filtered = Object.values(comparisonData).filter(p => 
            p.baseProduct.name.toLowerCase().includes(query) || 
            p.counterpartProduct.name.toLowerCase().includes(query)
        );
        
        // Sort by SnappFood products first, then TapsiFood products
        filtered.sort((a, b) => {
            const aSnappMatch = a.baseProduct.name.toLowerCase().includes(query);
            const aTapsiMatch = a.counterpartProduct.name.toLowerCase().includes(query);
            const bSnappMatch = b.baseProduct.name.toLowerCase().includes(query);
            const bTapsiMatch = b.counterpartProduct.name.toLowerCase().includes(query);
            
            // Prioritize SnappFood matches first
            if (aSnappMatch && !bSnappMatch) return -1;
            if (!aSnappMatch && bSnappMatch) return 1;
            
            // If both are SnappFood matches or both are TapsiFood matches, maintain original order
            return 0;
        });
        
        if (filtered.length === 0) {
            resultsList.innerHTML = '<li>محصولی یافت نشد.</li>';
            return;
        }
        
        filtered.forEach(item => {
            const li = document.createElement('li');
            
            let priceDiffText;
            if (item.priceDiff === 0) {
                priceDiffText = `<span class="sp-vs-tp-same-price-text">(سفارش از تپسی‌فود - پیک رایگان)</span>`;
            } else if (item.priceDiff > 0) {
                priceDiffText = `<span class="sp-vs-tp-cheaper-text">(${item.percentDiff}% ارزان‌تر در تپسی‌فود - ${formatPrice(item.priceDiff)} تومان کمتر)</span>`;
            } else {
                priceDiffText = `<span class="sp-vs-tp-expensive-text">(${item.percentDiff}% گران‌تر در تپسی‌فود - ${formatPrice(Math.abs(item.priceDiff))} تومان بیشتر)</span>`;
            }
            
            // Show discount info if available
            const sfDiscountInfo = item.baseProduct.discountRatio > 0 ? 
                ` <small style="color: #28a745;">(${item.baseProduct.discountRatio}% تخفیف)</small>` : '';
            const tfDiscountInfo = item.counterpartProduct.discountRatio > 0 ? 
                ` <small style="color: #28a745;">(${item.counterpartProduct.discountRatio}% تخفیف)</small>` : '';
            
            li.innerHTML = `
                <div class="result-item">
                    <p><b>${item.baseProduct.name}</b></p>
                    <p>اسنپ‌فود: ${formatPrice(item.baseProduct.price)} تومان${sfDiscountInfo}</p>
                    <p>تپسی‌فود: ${formatPrice(item.counterpartProduct.price)} تومان${tfDiscountInfo} ${priceDiffText}</p>
                </div>
            `;
            
            // Add click handler to search results
            li.addEventListener('click', () => {
                openOtherPlatform();
            });
            li.style.cursor = 'pointer';
            
            resultsList.appendChild(li);
        });
    });
}

// --- Main Execution Logic ---
function run() {
    const snappfoodVendorCode = getVendorCodeFromUrl(window.location.href);
    if (!snappfoodVendorCode) {
        console.log("SnappFood Comparator: No vendor code detected in URL");
        return;
    }
    
    console.log("SnappFood Comparator: Vendor detected:", snappfoodVendorCode);
    
    // Send request with platform and detected vendor code
    // Background script will determine the counterpart vendor from CSV data
    chrome.runtime.sendMessage(
        { 
            action: "fetchPrices", 
            sfVendorCode: snappfoodVendorCode, 
            sourcePlatform: "snappfood" 
        },
        (response) => {
            // Check for Chrome runtime errors
            if (chrome.runtime.lastError) {
                console.warn("SnappFood Comparator: Chrome messaging error:", chrome.runtime.lastError.message);
                return;
            }
            
            if (response && response.success) {
                console.log("SnappFood Comparator: Data received.", response.data);
                comparisonData = response.data;
                vendorInfo = response.vendorInfo || {};
                
                injectFloatingWidget();
                
                // SnappFood loads content dynamically, so we need to observe changes
                const observer = new MutationObserver((mutations) => {
                    document.querySelectorAll('section.ProductCard__Box-sc-1wfx2e0-0').forEach(injectComparison);
                });
                
                // Start observing the main content area
                const targetNode = document.getElementById('__next');
                if(targetNode) {
                    observer.observe(targetNode, { childList: true, subtree: true });
                }
                
                // Initial run
                document.querySelectorAll('section.ProductCard__Box-sc-1wfx2e0-0').forEach(injectComparison);
            } else {
                console.error("SnappFood Comparator: Failed to get data.", response?.error || "Unknown error");
                
                // Show a notification if vendor is not supported
                if (response?.error?.includes("not supported")) {
                    const notification = document.createElement('div');
                    notification.style.cssText = `
                        position: fixed;
                        top: 80px;
                        right: 20px;
                        background: rgba(220, 53, 69, 0.9);
                        color: white;
                        padding: 15px 20px;
                        border-radius: 8px;
                        font-family: 'IRANSansMobile', sans-serif;
                        z-index: 999999;
                        direction: rtl;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    `;
                    notification.textContent = 'این رستوران در حال حاضر پشتیبانی نمی‌شود';
                    document.body.appendChild(notification);
                    
                    // Auto-remove after 5 seconds
                    setTimeout(() => {
                        if (notification.parentNode) {
                            notification.parentNode.removeChild(notification);
                        }
                    }, 5000);
                }
            }
        }
    );
}

// Wait a bit for background script to be ready, then run
setTimeout(run, 100);