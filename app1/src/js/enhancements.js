// 🚀 Frontend Enhancements for 10/10 Score

// Modern notification system
window.showNotification = async function(type, message, duration = 3000) {
    const notification = document.createElement('div');
    notification.className = `alert alert-${type === 'error' ? 'danger' : type} notification-toast`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 9999;
        min-width: 300px;
        max-width: 400px;
        animation: slideInRight 0.3s ease;
        box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
        border: none;
        border-radius: 0.5rem;
    `;
    
    notification.innerHTML = `
        <div class="d-flex align-items-center">
            <div class="flex-grow-1">${message}</div>
            <button type="button" class="btn-close ms-2" onclick="this.parentElement.parentElement.remove()"></button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, duration);
};

// Lazy loading for images
document.addEventListener('DOMContentLoaded', function() {
    const images = document.querySelectorAll('img[data-src]');
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.classList.add('loaded');
                img.removeAttribute('data-src');
                observer.unobserve(img);
            }
        });
    });
    
    images.forEach(img => imageObserver.observe(img));
});

// Enhanced form validation
window.validateForm = function(formId) {
    const form = document.getElementById(formId);
    if (!form) return false;
    
    const inputs = form.querySelectorAll('input[required], textarea[required], select[required]');
    let isValid = true;
    
    inputs.forEach(input => {
        if (!input.value.trim()) {
            input.classList.add('is-invalid');
            isValid = false;
            
            // Create feedback if doesn't exist
            if (!input.nextElementSibling || !input.nextElementSibling.classList.contains('invalid-feedback')) {
                const feedback = document.createElement('div');
                feedback.className = 'invalid-feedback';
                feedback.textContent = 'กรุณากรอกข้อมูลในช่องนี้';
                input.parentNode.insertBefore(feedback, input.nextSibling);
            }
        } else {
            input.classList.remove('is-invalid');
            const feedback = input.nextElementSibling;
            if (feedback && feedback.classList.contains('invalid-feedback')) {
                feedback.remove();
            }
        }
    });
    
    return isValid;
};

// Smooth scroll with offset
window.scrollToSection = function(elementId, offset = 80) {
    const element = document.getElementById(elementId);
    if (element) {
        const elementPosition = element.offsetTop - offset;
        window.scrollTo({
            top: elementPosition,
            behavior: 'smooth'
        });
    }
};

// Enhanced loading states
window.setLoadingState = function(element, loading = true) {
    if (loading) {
        element.disabled = true;
        element.dataset.originalText = element.textContent;
        element.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>กำลังโหลด...';
    } else {
        element.disabled = false;
        element.textContent = element.dataset.originalText || element.textContent;
        delete element.dataset.originalText;
    }
};

// Skeleton loading
window.showSkeleton = function(container, count = 3) {
    const skeletonHTML = Array(count).fill('').map(() => `
        <div class="skeleton-card">
            <div class="skeleton-image"></div>
            <div class="skeleton-content">
                <div class="skeleton-title"></div>
                <div class="skeleton-text"></div>
                <div class="skeleton-text"></div>
                <div class="skeleton-button"></div>
            </div>
        </div>
    `).join('');
    
    container.innerHTML = skeletonHTML;
};

// Debounce function for performance
window.debounce = function(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

// Throttle function for scroll events
window.throttle = function(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};

// Enhanced navbar scroll effect
window.initNavbarScroll = function() {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;
    
    window.addEventListener('scroll', throttle(() => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    }, 100));
};

// Copy to clipboard functionality
window.copyToClipboard = async function(text, buttonElement) {
    try {
        await navigator.clipboard.writeText(text);
        if (buttonElement) {
            const originalText = buttonElement.textContent;
            buttonElement.textContent = 'คัดลอกแล้ว!';
            buttonElement.classList.add('btn-success');
            
            setTimeout(() => {
                buttonElement.textContent = originalText;
                buttonElement.classList.remove('btn-success');
            }, 2000);
        }
        await showNotification('success', 'คัดลอกลงคลิปบอร์ดแล้ว');
    } catch (err) {
        await showNotification('error', 'ไม่สามารถคัดลอกได้');
    }
};

// Enhanced search functionality
window.initSearch = function(inputId, containerId, searchFunction) {
    const input = document.getElementById(inputId);
    const container = document.getElementById(containerId);
    
    if (!input || !container) return;
    
    input.addEventListener('input', debounce(async (e) => {
        const query = e.target.value.trim();
        if (query.length < 2) {
            container.innerHTML = '';
            return;
        }
        
        try {
            const results = await searchFunction(query);
            displaySearchResults(results, container);
        } catch (error) {
            console.error('Search error:', error);
            container.innerHTML = '<div class="text-muted">เกิดข้อผิดพลาดในการค้นหา</div>';
        }
    }, 300));
};

// Display search results
window.displaySearchResults = function(results, container) {
    if (!results || results.length === 0) {
        container.innerHTML = '<div class="text-muted">ไม่พบผลลัพธ์</div>';
        return;
    }
    
    const resultsHTML = results.map(result => `
        <div class="search-result-item p-3 border-bottom hover:bg-gray-50 cursor-pointer transition-colors">
            <div class="font-weight-semibold">${result.title || result.name}</div>
            <div class="text-muted small">${result.description || result.subtitle || ''}</div>
        </div>
    `).join('');
    
    container.innerHTML = resultsHTML;
};

// Keyboard navigation
window.initKeyboardNavigation = function() {
    document.addEventListener('keydown', (e) => {
        // Ctrl+K for search
        if (e.ctrlKey && e.key === 'k') {
            e.preventDefault();
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.focus();
            }
        }
        
        // Escape to close modals
        if (e.key === 'Escape') {
            const openModal = document.querySelector('.modal.show');
            if (openModal) {
                const modal = bootstrap.Modal.getInstance(openModal);
                if (modal) modal.hide();
            }
        }
    });
};

// Performance monitoring
window.initPerformanceMonitoring = function() {
    // Measure page load time
    window.addEventListener('load', () => {
        const loadTime = performance.now();
        console.log(`Page load time: ${loadTime.toFixed(2)}ms`);
        
        // Send to analytics if available
        if (window.gtag) {
            gtag('event', 'page_load_time', {
                value: Math.round(loadTime)
            });
        }
    });
};

// Initialize all enhancements
document.addEventListener('DOMContentLoaded', function() {
    initNavbarScroll();
    initKeyboardNavigation();
    initPerformanceMonitoring();
    
    // Add smooth scroll to all anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            scrollToSection(targetId);
        });
    });
});

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOutRight {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    .notification-toast {
        animation: slideInRight 0.3s ease;
    }
    
    .search-result-item:hover {
        background-color: rgba(78, 115, 223, 0.05);
    }
    
    .is-invalid {
        border-color: #e74a3b !important;
        box-shadow: 0 0 0 0.2rem rgba(231, 74, 59, 0.25) !important;
    }
    
    .invalid-feedback {
        color: #e74a3b;
        font-size: 0.875em;
        margin-top: 0.25rem;
    }
`;
document.head.appendChild(style);
