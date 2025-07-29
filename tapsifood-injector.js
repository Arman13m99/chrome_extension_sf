// Dynamic TapsiFood Injector - Enhanced with new features
// --- Globals ---
let comparisonData = {};
let vendorInfo = {};
let allProductElements = new Set();

// --- Helper Functions ---
function getVendorCodeFromUrl(url) {
    const match = url.match(/tapsi\.food\/vendor\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
}

function formatPrice(amount) {
    return new Intl.NumberFormat('fa-IR').format(amount);
}

function generateSnappFoodUrl(sfCode) {
    return `https://snappfood.ir/restaurant/menu/r-${sfCode}`;
}

function openOtherPlatform() {
    if (vendorInfo.sf_code) {
        const url = generateSnappFoodUrl(vendorInfo.sf_code);
        window.open(url, '_blank');
    }
}

// --- UI Injection ---
function injectComparison(productCard) {
    // Track all product elements
    allProductElements.add(productCard);
    
    // TapsiFood has product IDs on the DOM, which is much more reliable
    const parentDiv = productCard.parentElement;
    const productId = parentDiv.id;
    
    if (!productId || !comparisonData[productId]) {
        // This is an unpaired product
        if (!productCard.classList.contains('sp-vs-tp-unpaired')) {
            productCard.classList.add('sp-vs-tp-unpaired');
        }
        return;
    }
    
    const data = comparisonData[productId];
    if (productCard.querySelector('.sp-vs-tp-comparison-text')) return; // Already injected
    
    const priceElement = productCard.querySelector('div.mt-auto > div > span');
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
        text = `سفارش از اسنپ‌فود${discountNote}`;
        className = 'sp-vs-tp-same-price-gray';
    }
    // Fixed logic: when priceDiff < 0, TapsiFood (base) is cheaper than SnappFood (counterpart)
    else if (data.priceDiff < 0) {
        // TapsiFood is cheaper, SnappFood is more expensive
        text = `${data.percentDiff}% گران‌تر در اسنپ‌فود (${absDiff} تومان بیشتر)${discountNote}`;
        className = 'sp-vs-tp-expensive';
    } else if (data.priceDiff > 0) {
        // TapsiFood is more expensive, SnappFood is cheaper
        text = `${data.percentDiff}% ارزان‌تر در اسنپ‌فود (${absDiff} تومان کمتر)${discountNote}`;
        className = 'sp-vs-tp-cheaper';
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
    
    // Insert before the price element's container
    priceElement.parentElement.parentElement.insertBefore(comparisonDiv, priceElement.parentElement);
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
    const restaurantName = vendorInfo.tf_name || 'رستوران';
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
            const aSnappMatch = a.counterpartProduct.name.toLowerCase().includes(query);
            const aTapsiMatch = a.baseProduct.name.toLowerCase().includes(query);
            const bSnappMatch = b.counterpartProduct.name.toLowerCase().includes(query);
            const bTapsiMatch = b.baseProduct.name.toLowerCase().includes(query);
            
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
                priceDiffText = `<span class="sp-vs-tp-same-price-text" style="color: #ffb366;">(سفارش از اسنپ‌فود)</span>`;
            } else if (item.priceDiff < 0) {
                priceDiffText = `<span class="sp-vs-tp-expensive-text">(${item.percentDiff}% گران‌تر در اسنپ‌فود - ${formatPrice(Math.abs(item.priceDiff))} تومان بیشتر)</span>`;
            } else {
                priceDiffText = `<span class="sp-vs-tp-cheaper-text">(${item.percentDiff}% ارزان‌تر در اسنپ‌فود - ${formatPrice(item.priceDiff)} تومان کمتر)</span>`;
            }
            
            // Show discount info if available
            const tfDiscountInfo = item.baseProduct.discountRatio > 0 ? 
                ` <small style="color: #28a745;">(${item.baseProduct.discountRatio}% تخفیف)</small>` : '';
            const sfDiscountInfo = item.counterpartProduct.discountRatio > 0 ? 
                ` <small style="color: #28a745;">(${item.counterpartProduct.discountRatio}% تخفیف)</small>` : '';
            
            li.innerHTML = `
                <div class="result-item">
                    <p><b>${item.baseProduct.name}</b></p>
                    <p>تپسی‌فود: ${formatPrice(item.baseProduct.price)} تومان${tfDiscountInfo}</p>
                    <p>اسنپ‌فود: ${formatPrice(item.counterpartProduct.price)} تومان${sfDiscountInfo} ${priceDiffText}</p>
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
    const tapsifoodVendorCode = getVendorCodeFromUrl(window.location.href);
    if (!tapsifoodVendorCode) {
        console.log("TapsiFood Comparator: No vendor code detected in URL");
        return;
    }
    
    console.log("TapsiFood Comparator: Vendor detected:", tapsifoodVendorCode);
    
    // Send request with platform and detected vendor code
    // Background script will determine the counterpart vendor from CSV data
    chrome.runtime.sendMessage(
        { 
            action: "fetchPrices", 
            tfVendorCode: tapsifoodVendorCode, 
            sourcePlatform: "tapsifood" 
        },
        (response) => {
            // Check for Chrome runtime errors
            if (chrome.runtime.lastError) {
                console.warn("TapsiFood Comparator: Chrome messaging error:", chrome.runtime.lastError.message);
                return;
            }
            
            if (response && response.success) {
                console.log("TapsiFood Comparator: Data received.", response.data);
                comparisonData = response.data;
                vendorInfo = response.vendorInfo || {};
                
                injectFloatingWidget();
                
                const observer = new MutationObserver((mutations) => {
                    document.querySelectorAll('section.duration-350').forEach(injectComparison);
                });
                
                const targetNode = document.body;
                if (targetNode) {
                    observer.observe(targetNode, { childList: true, subtree: true });
                }
                
                document.querySelectorAll('section.duration-350').forEach(injectComparison);
            } else {
                console.error("TapsiFood Comparator: Failed to get data.", response?.error || "Unknown error");
                
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