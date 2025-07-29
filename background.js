// API-based Price Comparator Background Script - Phase 2 Enhanced
console.log("Background: Starting Food Price Comparator extension - Phase 2");

// Configuration
const API_BASE_URL = 'http://127.0.0.1:8000';  // Local FastAPI server

// Global data cache
let vendorDataCache = new Map(); // Cache API responses for performance
let cacheExpiry = new Map();     // Track cache expiry times
let vendorListCache = null;      // Cache for vendor list
let vendorListCacheExpiry = 0;   // Cache expiry for vendor list

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache
const VENDOR_LIST_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes cache for vendor list

// API Helper Functions
async function fetchFromAPI(endpoint) {
    const url = `${API_BASE_URL}${endpoint}`;
    console.log(`Background: Fetching from API: ${url}`);
    
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            if (response.status === 404) {
                return { success: false, error: "Endpoint not found", status: 404 };
            }
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        return { success: true, data };
        
    } catch (error) {
        console.error(`Background: API call failed for ${endpoint}:`, error);
        
        if (error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
            return { 
                success: false, 
                error: "API server not available. Please ensure the FastAPI server is running on port 8000.",
                isConnectionError: true
            };
        }
        
        return { success: false, error: error.message };
    }
}

async function getVendorData(platform, vendorCode) {
    const cacheKey = `${platform}-${vendorCode}`;
    const now = Date.now();
    
    // Check cache first
    if (vendorDataCache.has(cacheKey) && cacheExpiry.get(cacheKey) > now) {
        console.log(`Background: Using cached data for ${cacheKey}`);
        return { success: true, data: vendorDataCache.get(cacheKey) };
    }
    
    // Fetch from API
    const endpoint = `/extension/vendor-data/${platform}/${vendorCode}`;
    const result = await fetchFromAPI(endpoint);
    
    if (result.success) {
        // Cache the response
        vendorDataCache.set(cacheKey, result.data);
        cacheExpiry.set(cacheKey, now + CACHE_DURATION);
        console.log(`Background: Cached data for ${cacheKey}`);
    }
    
    return result;
}

async function getAPIStats() {
    try {
        const result = await fetchFromAPI('/stats');
        return result;
    } catch (error) {
        console.error("Background: Failed to get API stats:", error);
        return { success: false, error: error.message };
    }
}

async function getVendorsList() {
    const now = Date.now();
    
    // Check cache first
    if (vendorListCache && vendorListCacheExpiry > now) {
        console.log("Background: Using cached vendor list");
        return { success: true, data: vendorListCache };
    }
    
    try {
        // Fetch from API using correct endpoint
        const result = await fetchFromAPI('/vendors?limit=1000'); // Get all vendors
        
        if (result.success) {
            // Cache the response
            vendorListCache = result.data;
            vendorListCacheExpiry = now + VENDOR_LIST_CACHE_DURATION;
            console.log(`Background: Cached vendor list with ${result.data?.length || 0} vendors`);
        } else {
            console.warn("Background: Failed to fetch vendor list:", result.error);
        }
        
        return result;
    } catch (error) {
        console.error("Background: Exception in getVendorsList:", error);
        return { success: false, error: error.message };
    }
}

// Enhanced comparison function with API data
function processAndCompare(sfProducts, tfProducts, sourcePlatform, itemMappings) {
    console.log(`Background: Starting comparison for ${sourcePlatform}`);
    console.log(`Background: SF products count: ${Object.keys(sfProducts).length}`);
    console.log(`Background: TF products count: ${Object.keys(tfProducts).length}`);
    console.log(`Background: Item mappings count: ${Object.keys(itemMappings).length}`);
    
    const comparisonResults = {};
    const baseProducts = sourcePlatform === 'snappfood' ? sfProducts : tfProducts;
    const counterpartProducts = sourcePlatform === 'snappfood' ? tfProducts : sfProducts;
    
    let foundMappings = 0;
    let validComparisons = 0;
    
    for (const baseId in baseProducts) {
        const baseIdInt = parseInt(baseId);
        const counterpartId = itemMappings[baseIdInt];
        
        if (counterpartId) {
            foundMappings++;
            console.log(`Background: Found mapping ${baseIdInt} -> ${counterpartId}`);
            
            if (counterpartProducts[counterpartId]) {
                const baseProduct = baseProducts[baseId];
                const counterpartProduct = counterpartProducts[counterpartId];
                
                console.log(`Background: Comparing "${baseProduct.name}" (${baseProduct.price}) with "${counterpartProduct.name}" (${counterpartProduct.price})`);
                
                if (baseProduct.price > 0) { // Avoid division by zero
                    const priceDiff = baseProduct.price - counterpartProduct.price;
                    const percentDiff = Math.round((Math.abs(priceDiff) / baseProduct.price) * 100);
                    
                    comparisonResults[baseId] = {
                        baseProduct,
                        counterpartProduct,
                        priceDiff,
                        percentDiff,
                        isCheaper: priceDiff > 0,
                        isMoreExpensive: priceDiff < 0,
                        isSamePrice: priceDiff === 0
                    };
                    validComparisons++;
                }
            } else {
                console.log(`Background: Counterpart product ${counterpartId} not found in fetched data`);
            }
        }
    }
    
    console.log(`Background: Found ${foundMappings} mappings, created ${validComparisons} valid comparisons`);
    return comparisonResults;
}

// API fetching functions (enhanced with discount handling)
async function fetchSnappfoodData(vendorCode) {
    const url = `https://snappfood.ir/mobile/v2/restaurant/details/dynamic?lat=35.715&long=51.404&vendorCode=${vendorCode}&optionalClient=WEBSITE&client=WEBSITE&deviceType=WEBSITE&appVersion=8.1.1`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`SnappFood API Error: ${response.status}`);
        const json = await response.json();
        
        if (!json || !json.data || !Array.isArray(json.data.menus)) {
            throw new Error("Invalid SnappFood API response: 'data.menus' array not found.");
        }
        
        const products = {};
        json.data.menus.forEach(menuSection => {
            if (menuSection && Array.isArray(menuSection.products)) {
                menuSection.products.forEach(p => {
                    if (p && p.id && typeof p.title !== 'undefined' && typeof p.price !== 'undefined') {
                        // Calculate price after discount: price - discount
                        const originalPrice = p.price || 0;
                        const discount = p.discount || 0;
                        const finalPrice = originalPrice - discount;
                        
                        console.log(`Background: SnappFood product ${p.id} - Original: ${originalPrice}, Discount: ${discount}, Final: ${finalPrice}`);
                        
                        products[p.id] = {
                            id: p.id,
                            name: p.title.trim(),
                            price: finalPrice, // Use price after discount
                            originalPrice: originalPrice,
                            discount: discount,
                            discountRatio: p.discountRatio || 0
                        };
                    }
                });
            }
        });
        
        if (Object.keys(products).length === 0) {
            console.warn("SnappFood: Response parsed, but no products were extracted. API structure may have changed.");
        }
        
        return products;
    } catch (error) {
        console.error("Failed to fetch SnappFood data:", error);
        return null;
    }
}

async function fetchTapsifoodData(vendorCode) {
    const url = `https://api.tapsi.food/v1/api/Vendor/${vendorCode}/vendor?latitude=35.7559&longitude=51.4132`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`TapsiFood API Error: ${response.status}`);
        const json = await response.json();
        
        if (!json || !json.data || !Array.isArray(json.data.categories)) {
             throw new Error("Invalid or unexpected TapsiFood API response structure.");
        }
        
        const products = {};
        json.data.categories.forEach(category => {
            if(category.products && Array.isArray(category.products)) {
                category.products.forEach(p => {
                    if (p && p.productVariations && p.productVariations.length > 0) {
                        // Use priceAfterDiscount for accurate comparison
                        const variation = p.productVariations[0];
                        const originalPrice = variation.price || 0;
                        const finalPrice = variation.priceAfterDiscount || originalPrice;
                        const discountRatio = variation.discountRatio || 0;
                        
                        console.log(`Background: TapsiFood product ${p.productId} - Original: ${originalPrice}, Final: ${finalPrice}, Discount%: ${discountRatio}`);
                        
                        products[p.productId] = {
                            id: p.productId,
                            name: p.productName.trim(),
                            price: finalPrice, // Use priceAfterDiscount
                            originalPrice: originalPrice,
                            discountRatio: discountRatio
                        };
                    }
                });
            }
        });
        
        return products;
    } catch (error) {
        console.error("Failed to fetch TapsiFood data:", error);
        return null;
    }
}

// Enhanced message listener with proper error handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log(`Background: Received message:`, request.action);
    
    if (request.action === "fetchPrices") {
        (async () => {
            const { sfVendorCode, tfVendorCode, sourcePlatform } = request;
            let actualSfCode, actualTfCode, vendorInfo;
            
            console.log(`Background: Processing request for platform: ${sourcePlatform}`);
            
            try {
                // Get vendor data from API
                let apiResult;
                if (sourcePlatform === "snappfood" && sfVendorCode) {
                    apiResult = await getVendorData('snappfood', sfVendorCode);
                    if (!apiResult.success) {
                        console.log("Background: SnappFood vendor not found in API:", sfVendorCode);
                        sendResponse({ success: false, error: apiResult.error });
                        return;
                    }
                    actualSfCode = apiResult.data.vendor_info.sf_code;
                    actualTfCode = apiResult.data.vendor_info.tf_code;
                    vendorInfo = apiResult.data.vendor_info;
                    
                } else if (sourcePlatform === "tapsifood" && tfVendorCode) {
                    apiResult = await getVendorData('tapsifood', tfVendorCode);
                    if (!apiResult.success) {
                        console.log("Background: TapsiFood vendor not found in API:", tfVendorCode);
                        sendResponse({ success: false, error: apiResult.error });
                        return;
                    }
                    actualSfCode = apiResult.data.vendor_info.sf_code;
                    actualTfCode = apiResult.data.vendor_info.tf_code;
                    vendorInfo = apiResult.data.vendor_info;
                    
                } else {
                    sendResponse({ success: false, error: "Invalid request format." });
                    return;
                }
                
                console.log(`Background: API returned vendor data for SF:${actualSfCode} TF:${actualTfCode}`);
                console.log(`Background: Item mappings available: ${apiResult.data.item_count}`);
                
                // Fetch product data from both platforms
                const [sfProducts, tfProducts] = await Promise.all([
                    fetchSnappfoodData(actualSfCode),
                    fetchTapsifoodData(actualTfCode)
                ]);
                
                console.log(`Background: Fetched ${sfProducts ? Object.keys(sfProducts).length : 0} SF products, ${tfProducts ? Object.keys(tfProducts).length : 0} TF products`);
                
                if (sfProducts && tfProducts) {
                    const comparisonData = processAndCompare(
                        sfProducts, 
                        tfProducts, 
                        sourcePlatform, 
                        apiResult.data.item_mappings
                    );
                    
                    console.log(`Background: Created ${Object.keys(comparisonData).length} comparisons for ${vendorInfo.sf_name}`);
                    
                    sendResponse({ 
                        success: true, 
                        data: comparisonData,
                        vendorInfo: vendorInfo
                    });
                } else {
                    let errorMsg = "Failed to fetch data from one or both platforms.";
                    if (!sfProducts) errorMsg += " (SnappFood failed)";
                    if (!tfProducts) errorMsg += " (TapsiFood failed)";
                    console.error("Background:", errorMsg);
                    sendResponse({ success: false, error: errorMsg });
                }
                
            } catch (error) {
                console.error("Background: Unexpected error:", error);
                sendResponse({ 
                    success: false, 
                    error: `Unexpected error: ${error.message}` 
                });
            }
        })();
        return true; // Indicates that the response is sent asynchronously
    }
    
    // Enhanced vendor list action with API integration - Phase 2
    else if (request.action === "getVendorList") {
        (async () => {
            try {
                console.log("Background: Processing getVendorList request");
                
                const [statsResult, vendorsResult] = await Promise.all([
                    getAPIStats(),
                    getVendorsList()
                ]);
                
                console.log("Background: API Stats result:", statsResult.success);
                console.log("Background: API Vendors result:", vendorsResult.success);
                
                if (statsResult.success || vendorsResult.success) {
                    // At least one API call succeeded
                    let vendors = [];
                    let stats = {
                        totalVendors: 0,
                        totalItems: 0,
                        uniqueSfVendors: 0,
                        uniqueTfVendors: 0
                    };
                    
                    if (vendorsResult.success && vendorsResult.data) {
                        vendors = vendorsResult.data;
                        console.log(`Background: Retrieved ${vendors.length} vendors from API`);
                        console.log("Background: Sample vendor:", vendors[0]);
                    } else {
                        console.warn("Background: Failed to get vendors list:", vendorsResult.error);
                    }
                    
                    if (statsResult.success && statsResult.data) {
                        stats = {
                            totalVendors: statsResult.data.total_vendors,
                            totalItems: statsResult.data.total_items,
                            uniqueSfVendors: statsResult.data.unique_sf_vendors,
                            uniqueTfVendors: statsResult.data.unique_tf_vendors
                        };
                    } else {
                        console.warn("Background: Failed to get API stats:", statsResult.error);
                    }
                    
                    sendResponse({ 
                        success: true, 
                        vendors: vendors,
                        stats: stats,
                        apiErrors: {
                            statsError: statsResult.success ? null : statsResult.error,
                            vendorsError: vendorsResult.success ? null : vendorsResult.error
                        }
                    });
                } else {
                    console.error("Background: Both API calls failed");
                    console.error("Background: Stats error:", statsResult.error);
                    console.error("Background: Vendors error:", vendorsResult.error);
                    
                    // Send empty response to allow content scripts to continue
                    sendResponse({ 
                        success: true, // Still true to allow content scripts to work
                        vendors: [],
                        stats: {
                            totalVendors: 0,
                            totalItems: 0,
                            uniqueSfVendors: 0,
                            uniqueTfVendors: 0
                        },
                        error: "Both stats and vendors API calls failed",
                        isConnectionError: true,
                        apiErrors: {
                            statsError: statsResult.error,
                            vendorsError: vendorsResult.error
                        }
                    });
                }
            } catch (error) {
                console.error("Background: Failed to get vendor list:", error);
                // Send empty response to allow content scripts to continue
                sendResponse({ 
                    success: true, // Changed to true to allow content scripts to work
                    vendors: [],
                    stats: {
                        totalVendors: 0,
                        totalItems: 0,
                        uniqueSfVendors: 0,
                        uniqueTfVendors: 0
                    },
                    error: `Failed to connect to API: ${error.message}`,
                    isConnectionError: true
                });
            }
        })();
        return true;
    }
    
    // Unknown action
    else {
        console.warn(`Background: Unknown action: ${request.action}`);
        sendResponse({ success: false, error: "Unknown action" });
        return false;
    }
});

// Test API connection on startup
console.log("Background: Food Price Comparator API-based extension started - Phase 2");
console.log(`Background: API Base URL: ${API_BASE_URL}`);

// Test connection with better error handling
(async () => {
    try {
        const result = await fetchFromAPI('/health');
        if (result.success) {
            console.log("Background: ✅ API connection successful!");
            console.log("Background: API Health:", result.data);
        } else {
            console.log("Background: ❌ API connection failed!");
            console.log("Background: Error:", result.error);
            if (result.isConnectionError) {
                console.log("Background: Please ensure FastAPI server is running on http://127.0.0.1:8000");
            }
        }
    } catch (error) {
        console.error("Background: Failed to test API connection:", error);
    }
})();

// Periodic cache cleanup
setInterval(() => {
    const now = Date.now();
    
    // Clean vendor data cache
    for (const [key, expiry] of cacheExpiry.entries()) {
        if (expiry <= now) {
            vendorDataCache.delete(key);
            cacheExpiry.delete(key);
            console.log(`Background: Cleaned expired cache for ${key}`);
        }
    }
    
    // Clean vendor list cache
    if (vendorListCacheExpiry <= now) {
        vendorListCache = null;
        vendorListCacheExpiry = 0;
        console.log("Background: Cleaned expired vendor list cache");
    }
}, 60000); // Clean every minute

console.log("Background: Service worker setup complete");