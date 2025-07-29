// Enhanced popup functionality with dynamic data
document.addEventListener('DOMContentLoaded', function() {
    console.log("مقایسه‌گر قیمت غذا - پاپ‌آپ باز شد");
    
    // Load vendor statistics
    loadVendorStats();
    
    // Check if current tab is on a supported site
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        const currentUrl = tabs[0].url;
        checkCurrentSite(currentUrl);
    });
    
    // Add click animations to features
    const features = document.querySelectorAll('.feature');
    features.forEach(feature => {
        feature.addEventListener('click', function() {
            this.style.transform = 'scale(0.98)';
            setTimeout(() => {
                this.style.transform = 'translateY(-1px)';
            }, 100);
        });
    });
});

function loadVendorStats() {
    chrome.runtime.sendMessage({ action: "getVendorList" }, (response) => {
        console.log("Popup: Vendor list response:", response);
        
        if (response && response.success) {
            updateVendorStats(response.stats, response.vendors);
            
            if (response.apiErrors) {
                console.warn("Popup: API errors detected:", response.apiErrors);
                showApiStatus(response.apiErrors);
            }
        } else {
            console.error("Failed to load vendor stats:", response?.error);
            showErrorStatus(response?.error);
        }
    });
}

function updateVendorStats(stats, vendors) {
    const statusItems = document.querySelectorAll('.status-item');
    
    // Update vendor count
    if (statusItems[1]) {
        const textSpan = statusItems[1].querySelector('span:last-child');
        textSpan.textContent = `${stats.totalVendors} رستوران پشتیبانی شده`;
    }
    
    // Update item count
    const itemCountElement = document.createElement('div');
    itemCountElement.className = 'status-item';
    itemCountElement.innerHTML = `
        <span class="status-indicator active"></span>
        <span>${stats.totalItems} محصول قابل مقایسه</span>
    `;
    
    // Insert after the second status item
    if (statusItems[1] && statusItems[1].parentNode) {
        statusItems[1].parentNode.insertBefore(itemCountElement, statusItems[1].nextSibling);
    }
    
    console.log(`Popup: Updated stats - ${stats.totalVendors} vendors, ${stats.totalItems} items`);
}

function checkCurrentSite(currentUrl) {
    const statusItems = document.querySelectorAll('.status-item');
    
    // Extract vendor codes from URL
    let detectedVendor = null;
    let platform = null;
    
    if (currentUrl.includes('snappfood.ir/restaurant/menu')) {
        const match = currentUrl.match(/-r-([a-zA-Z0-9]+)\/?/);
        if (match) {
            detectedVendor = match[1];
            platform = 'snappfood';
        }
    } else if (currentUrl.includes('tapsi.food/vendor')) {
        const match = currentUrl.match(/tapsi\.food\/vendor\/([a-zA-Z0-9]+)/);
        if (match) {
            detectedVendor = match[1];
            platform = 'tapsifood';
        }
    }
    
    console.log(`Popup: Detected vendor ${detectedVendor} on platform ${platform}`);
    
    if (detectedVendor && platform) {
        // Check if this vendor is supported
        chrome.runtime.sendMessage({ action: "getVendorList" }, (response) => {
            if (response && response.success && response.vendors) {
                console.log(`Popup: Checking ${response.vendors.length} vendors for ${detectedVendor}`);
                
                const supportedVendor = response.vendors.find(v => 
                    platform === 'snappfood' ? v.sf_code === detectedVendor : v.tf_code === detectedVendor
                );
                
                if (supportedVendor) {
                    const restaurantName = platform === 'snappfood' ? supportedVendor.sf_name : supportedVendor.tf_name;
                    const otherPlatform = platform === 'snappfood' ? 'تپسی‌فود' : 'اسنپ‌فود';
                    updateStatus(statusItems[0], true, `${restaurantName} - مقایسه با ${otherPlatform} فعال`);
                    
                    // Update instructions for this specific restaurant
                    updateInstructions(restaurantName, platform);
                    
                    console.log(`Popup: Found supported vendor: ${restaurantName}`);
                } else {
                    updateStatus(statusItems[0], false, 'رستوران شناسایی شد اما پشتیبانی نمی‌شود');
                    console.log(`Popup: Vendor ${detectedVendor} not found in supported list`);
                }
            } else {
                console.warn("Popup: Failed to get vendor list:", response?.error);
                updateStatus(statusItems[0], false, 'خطا در دریافت اطلاعات رستوران‌ها');
            }
        });
    } else {
        updateStatus(statusItems[0], false, 'لطفاً به صفحه منوی یک رستوران بروید');
    }
}

function updateStatus(statusItem, isActive, text) {
    const indicator = statusItem.querySelector('.status-indicator');
    const textSpan = statusItem.querySelector('span:last-child');
    
    if (isActive) {
        indicator.classList.add('active');
        indicator.style.background = '#28a745';
    } else {
        indicator.classList.remove('active');
        indicator.style.background = '#dc3545';
    }
    
    textSpan.textContent = text;
}

function updateInstructions(restaurantName, platform) {
    const instructionsDiv = document.querySelector('.instructions');
    if (instructionsDiv) {
        const platformName = platform === 'snappfood' ? 'اسنپ‌فود' : 'تپسی‌فود';
        const otherPlatform = platform === 'snappfood' ? 'تپسی‌فود' : 'اسنپ‌فود';
        
        instructionsDiv.innerHTML = `
            <h3>نحوه استفاده:</h3>
            <ol>
                <li>شما در حال حاضر در صفحه ${restaurantName} در ${platformName} هستید</li>
                <li>قیمت‌های مقایسه شده با ${otherPlatform} روی محصولات نمایش داده می‌شوند</li>
                <li>برای جستجو، روی آیکن 🔍 کلیک کنید</li>
                <li>محصولات ارزان‌تر با حاشیه سبز و گران‌تر با حاشیه قرمز نمایش داده می‌شوند</li>
            </ol>
        `;
    }
}

function showApiStatus(apiErrors) {
    const statusDiv = document.querySelector('.status');
    if (statusDiv && (apiErrors.statsError || apiErrors.vendorsError)) {
        const errorStatusItem = document.createElement('div');
        errorStatusItem.className = 'status-item';
        errorStatusItem.innerHTML = `
            <span class="status-indicator" style="background: #ffc107;"></span>
            <span>اتصال API محدود - برخی ویژگی‌ها ممکن است کار نکنند</span>
        `;
        statusDiv.appendChild(errorStatusItem);
    }
}

function showErrorStatus(error) {
    const statusItems = document.querySelectorAll('.status-item');
    if (statusItems[1]) {
        const textSpan = statusItems[1].querySelector('span:last-child');
        textSpan.textContent = 'خطا در دریافت اطلاعات سرور';
        
        const indicator = statusItems[1].querySelector('.status-indicator');
        indicator.style.background = '#dc3545';
        indicator.classList.remove('active');
    }
}