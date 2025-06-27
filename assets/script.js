// Global variables
let navigation = null;
let notificationSystem = null;
let currentBotId = null;

// Utility functions for performance optimization
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function throttle(func, limit) {
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
}

// DOM Element Cache for performance optimization
class DOMCache {
    constructor() {
        this.cache = new Map();
    }
    
    get(selector) {
        if (!this.cache.has(selector)) {
            const element = document.querySelector(selector);
            if (element) {
                this.cache.set(selector, element);
            }
            return element;
        }
        return this.cache.get(selector);
    }
    
    getAll(selector) {
        if (!this.cache.has(`all:${selector}`)) {
            const elements = document.querySelectorAll(selector);
            this.cache.set(`all:${selector}`, elements);
            return elements;
        }
        return this.cache.get(`all:${selector}`);
    }
    
    clear() {
        this.cache.clear();
    }
    
    clearSelector(selector) {
        this.cache.delete(selector);
        this.cache.delete(`all:${selector}`);
    }
}

// Mobile Menu System
class MobileMenu {
    constructor() {
        this.sidebar = null;
        this.overlay = null;
        this.menuButton = null;
        this.isOpen = false;
        this.init();
    }

    init() {
        this.sidebar = document.querySelector('.sidebar');
        this.overlay = document.querySelector('.mobile-overlay');
        console.log('🔧 Mobile menu init:', {
            sidebar: !!this.sidebar,
            overlay: !!this.overlay
        });
        this.addMobileMenuButtons();
        this.bindEvents();
    }

    // Method to reinitialize for dynamic content
    reinitialize() {
        console.log('🔄 Reinitializing mobile menu...');
        
        // Always update references
        this.sidebar = document.querySelector('.sidebar');
        this.overlay = document.querySelector('.mobile-overlay');
        
        console.log('🔧 Reinit - Elements found:', {
            sidebar: !!this.sidebar,
            overlay: !!this.overlay
        });
        
        // Close any open menu first
        if (this.isOpen) {
            this.close();
        }
        
        // Add buttons to any new headers
        this.addMobileMenuButtons();
        
        console.log('✅ Mobile menu reinitialized');
    }

    addMobileMenuButtons() {
        // Find all header elements that don't have mobile menu button
        const headers = document.querySelectorAll('.header');
        console.log('📱 Found headers:', headers.length);
        
        headers.forEach((header, index) => {
            // Check if mobile menu button already exists
            if (!header.querySelector('.mobile-menu-btn')) {
                // Create mobile menu button
                const mobileMenuBtn = document.createElement('button');
                mobileMenuBtn.className = 'mobile-menu-btn';
                mobileMenuBtn.setAttribute('aria-label', 'Open menu');
                mobileMenuBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                        <line x1="3" y1="18" x2="21" y2="18"></line>
                    </svg>
                `;
                
                // Insert as the first child of the header
                header.insertBefore(mobileMenuBtn, header.firstChild);
                console.log(`✅ Added menu button to header ${index}`);
            } else {
                console.log(`Header ${index} already has menu button`);
            }
        });
    }

    bindEvents() {
        // Mobile menu button event (works for all pages)
        document.addEventListener('click', (e) => {
            if (e.target.closest('.mobile-menu-btn')) {
                e.preventDefault();
                e.stopPropagation();
                console.log('🎯 Menu button clicked!');
                this.toggle();
            }
        });

        // Overlay click to close
        if (this.overlay) {
            this.overlay.addEventListener('click', (e) => {
                console.log('🎯 Overlay clicked');
                this.close();
            });
        }

        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                console.log('⌨️ Escape key pressed');
                this.close();
            }
        });

        // Close on navigation
        document.addEventListener('click', (e) => {
            if (e.target.closest('.nav-link') && this.isOpen) {
                console.log('🔗 Navigation link clicked');
                setTimeout(() => this.close(), 100); // Small delay for smooth transition
            }
        });

        // Handle resize
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768 && this.isOpen) {
                console.log('📱 Window resized, closing menu');
                this.close();
            }
        });
    }

    toggle() {
        console.log('🔄 Toggle menu, current state:', this.isOpen);
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        console.log('📂 Opening menu');
        if (!this.sidebar) {
            console.error('❌ Sidebar not found');
            return;
        }
        
        this.isOpen = true;
        this.sidebar.classList.add('open');
        
        // Force show overlay
        if (this.overlay) {
            this.overlay.style.visibility = 'visible';
            this.overlay.style.opacity = '1';
            this.overlay.classList.add('active');
        }

        // Prevent body scroll
        document.body.style.overflow = 'hidden';
        console.log('✅ Menu opened');
    }

    close() {
        console.log('📁 Closing menu');
        if (!this.sidebar) {
            console.error('❌ Sidebar not found');
            return;
        }
        
        this.isOpen = false;
        this.sidebar.classList.remove('open');
        
        // Hide overlay
        if (this.overlay) {
            this.overlay.classList.remove('active');
            this.overlay.style.opacity = '0';
            this.overlay.style.visibility = 'hidden';
        }

        // Restore body scroll
        document.body.style.overflow = '';
        console.log('✅ Menu closed');
    }
}

// Notification System
class NotificationSystem {
    constructor() {
        this.notifications = [];
        this.nextId = 1;
        this.maxNotifications = 50;
        this.init();
    }

    init() {
        this.createNotificationElements();
        this.bindEvents();
        this.loadTheme();
        
        // Initialize user menu buttons for all pages
        this.initializeUserMenus();
    }
    
    initializeUserMenus() {
        // Find all user menu buttons on all pages and attach events
        const userMenuButtons = document.querySelectorAll('#userMenuButton');
        const notificationButtons = document.querySelectorAll('#notificationButton');
        const logoutButtons = document.querySelectorAll('#logoutButton');
        const themeToggleButtons = document.querySelectorAll('#themeToggle');
        const clearAllButtons = document.querySelectorAll('#clearAllNotifications');
        
        // Remove existing event listeners by cloning elements (this removes all listeners)
        userMenuButtons.forEach(button => {
            if (button && !button.dataset.initialized) {
                const newButton = button.cloneNode(true);
                button.parentNode.replaceChild(newButton, button);
                newButton.addEventListener('click', () => this.toggleUserDropdown());
                newButton.dataset.initialized = 'true';
            }
        });
        
        notificationButtons.forEach(button => {
            if (button && !button.dataset.initialized) {
                const newButton = button.cloneNode(true);
                button.parentNode.replaceChild(newButton, button);
                newButton.addEventListener('click', () => this.toggleNotificationDropdown());
                newButton.dataset.initialized = 'true';
            }
        });
        
        logoutButtons.forEach(button => {
            if (button && !button.dataset.initialized) {
                const newButton = button.cloneNode(true);
                button.parentNode.replaceChild(newButton, button);
                newButton.addEventListener('click', () => this.logout());
                newButton.dataset.initialized = 'true';
            }
        });
        
        themeToggleButtons.forEach(button => {
            if (button && !button.dataset.initialized) {
                const newButton = button.cloneNode(true);
                button.parentNode.replaceChild(newButton, button);
                newButton.addEventListener('click', () => this.toggleTheme());
                newButton.dataset.initialized = 'true';
            }
        });
        
        clearAllButtons.forEach(button => {
            if (button && !button.dataset.initialized) {
                const newButton = button.cloneNode(true);
                button.parentNode.replaceChild(newButton, button);
                newButton.addEventListener('click', () => this.clearAllNotifications());
                newButton.dataset.initialized = 'true';
            }
        });
    }

    reinitializeForDashboard() {
        // Special reinitialization for dashboard - clear all flags first
        const allButtons = document.querySelectorAll('#userMenuButton, #notificationButton, #logoutButton, #themeToggle, #clearAllNotifications');
        allButtons.forEach(button => {
            if (button) {
                button.removeAttribute('data-initialized');
            }
        });
        
        // Then reinitialize
        this.initializeUserMenus();
        
        console.log('Dashboard menus reinitialized');
    }

    createNotificationElements() {
        // Create notification container if it doesn't exist
        if (!document.getElementById('notification-container')) {
            const container = document.createElement('div');
            container.id = 'notification-container';
            document.body.appendChild(container);
        }
    }

    bindEvents() {
        // Close dropdowns on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.notification-button') && !e.target.closest('.notification-dropdown')) {
                this.closeNotificationDropdown();
            }
            if (!e.target.closest('.user-info') && !e.target.closest('.user-dropdown')) {
                this.closeUserDropdown();
            }
        });
    }

    toggleNotificationDropdown() {
        const dropdowns = document.querySelectorAll('#notificationDropdown');
        const userDropdowns = document.querySelectorAll('#userDropdown');
        
        // Close user dropdowns if open
        userDropdowns.forEach(userDropdown => {
            if (userDropdown && userDropdown.classList.contains('show')) {
                this.closeUserDropdown();
            }
        });
        
        // Toggle all notification dropdowns
        dropdowns.forEach(dropdown => {
            if (dropdown) {
                dropdown.classList.toggle('show');
                if (dropdown.classList.contains('show')) {
                    this.markNotificationsAsRead();
                }
            }
        });
    }

    closeNotificationDropdown() {
        const dropdowns = document.querySelectorAll('#notificationDropdown');
        dropdowns.forEach(dropdown => {
            if (dropdown) {
                dropdown.classList.remove('show');
            }
        });
    }

    toggleUserDropdown() {
        const dropdowns = document.querySelectorAll('#userDropdown');
        const buttons = document.querySelectorAll('#userMenuButton');
        const notificationDropdowns = document.querySelectorAll('#notificationDropdown');
        
        // Close notification dropdowns if open
        notificationDropdowns.forEach(notificationDropdown => {
            if (notificationDropdown && notificationDropdown.classList.contains('show')) {
                this.closeNotificationDropdown();
            }
        });
        
        // Toggle all user dropdowns
        dropdowns.forEach(dropdown => {
            if (dropdown) {
                dropdown.classList.toggle('show');
            }
        });
        
        buttons.forEach(button => {
            if (button) {
                button.classList.toggle('active');
            }
        });
    }

    closeUserDropdown() {
        const dropdowns = document.querySelectorAll('#userDropdown');
        const buttons = document.querySelectorAll('#userMenuButton');
        
        dropdowns.forEach(dropdown => {
            if (dropdown) {
                dropdown.classList.remove('show');
            }
        });
        
        buttons.forEach(button => {
            if (button) {
                button.classList.remove('active');
            }
        });
    }

    addNotification(title, message, type = 'info', persistent = false) {
        const notification = {
            id: this.nextId++,
            title,
            message,
            type,
            timestamp: new Date(),
            read: false,
            persistent
        };

        this.notifications.unshift(notification);
        
        // Keep only the latest notifications
        if (this.notifications.length > this.maxNotifications) {
            this.notifications = this.notifications.slice(0, this.maxNotifications);
        }

        this.updateNotificationBadge();
        this.updateNotificationList();
        
        // Show toast notification
        this.showToastNotification(notification);
        
        return notification.id;
    }

    showToastNotification(notification) {
        const container = document.getElementById('notification-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `notification ${notification.type}`;
        toast.innerHTML = `
            <div class="notification-content">
                <strong>${notification.title}</strong>
                <p>${notification.message}</p>
            </div>
            <button type="button" onclick="this.parentElement.remove()">×</button>
        `;

        container.appendChild(toast);

        // Auto remove after 5 seconds unless persistent
        if (!notification.persistent) {
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.remove();
                }
            }, 5000);
        }
    }

    updateNotificationBadge() {
        const badges = document.querySelectorAll('#notificationBadge');
        badges.forEach(badge => {
            if (badge) {
                const unreadCount = this.notifications.filter(n => !n.read).length;
                badge.textContent = unreadCount;
                badge.classList.toggle('show', unreadCount > 0);
            }
        });
    }

    updateNotificationList() {
        const lists = document.querySelectorAll('#notificationList');
        
        lists.forEach(list => {
            if (!list) return;

            if (this.notifications.length === 0) {
                list.innerHTML = `
                    <div class="no-notifications">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                        </svg>
                        <p>Нет новых уведомлений</p>
                    </div>
                `;
                return;
            }

            list.innerHTML = this.notifications.map(notification => `
                <div class="notification-item ${!notification.read ? 'unread' : ''}" data-id="${notification.id}">
                    <div class="notification-content">
                        <div class="notification-icon ${notification.type}">
                            ${this.getNotificationIcon(notification.type)}
                        </div>
                        <div class="notification-text">
                            <div class="notification-title">${notification.title}</div>
                            <div class="notification-message">${notification.message}</div>
                            <div class="notification-time">${this.formatTime(notification.timestamp)}</div>
                        </div>
                        <button class="notification-close" onclick="notificationSystem.removeNotification(${notification.id})">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </div>
                </div>
            `).join('');
        });
    }

    getNotificationIcon(type) {
        const icons = {
            error: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',
            warning: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>',
            success: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>',
            info: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>'
        };
        return icons[type] || icons.info;
    }

    formatTime(timestamp) {
        const now = new Date();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'только что';
        if (minutes < 60) return `${minutes} мин назад`;
        if (hours < 24) return `${hours} ч назад`;
        if (days < 7) return `${days} дн назад`;
        return timestamp.toLocaleDateString();
    }

    removeNotification(id) {
        this.notifications = this.notifications.filter(n => n.id !== id);
        this.updateNotificationBadge();
        this.updateNotificationList();
    }

    clearAllNotifications() {
        this.notifications = [];
        this.updateNotificationBadge();
        this.updateNotificationList();
        this.closeNotificationDropdown();
    }

    markNotificationsAsRead() {
        this.notifications.forEach(n => n.read = true);
        this.updateNotificationBadge();
        this.updateNotificationList();
    }

    // Theme System
    loadTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        this.setTheme(savedTheme);
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);
    }

    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        
        // Update theme toggle text
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            const span = themeToggle.querySelector('span');
            if (span) {
                span.textContent = theme === 'dark' ? 'Светлая тема' : 'Темная тема';
            }
        }
    }

    async logout() {
        if (confirm('Вы уверены, что хотите выйти?')) {
            try {
                // Show goodbye notification before logout
                this.addNotification(
                    'До свидания!', 
                    'Вы успешно вышли из системы. Хорошего дня!', 
                    'success',
                    true // persistent notification
                );
                
                await fetch('/api/auth/logout', { method: 'POST' });
                
                // Wait a bit to show the notification
                setTimeout(() => {
                    // Clear saved state
                    localStorage.removeItem('currentPage');
                    localStorage.removeItem('currentTab');
                    localStorage.removeItem('currentEditingBotId');
                    
                    // Clear notifications after showing goodbye
                    this.clearAllNotifications();
                    
                    if (navigation) {
                        navigation.authenticated = false;
                        navigation.showPage('login');
                    }
                }, 1500);
                
            } catch (error) {
                console.error('Logout error:', error);
                // Even if logout API fails, clear local state and redirect
                localStorage.clear();
                if (navigation) {
                    navigation.authenticated = false;
                    navigation.showPage('login');
                }
            }
        }
    }
}

// Main application class
class PageNavigation {
    constructor() {
        this.currentPage = 'login';
        this.pages = ['login', 'dashboard', 'bots', 'debug', 'settings', 'admin', 'help', 'databases', 'bot-settings'];
        this.bots = [];
        this.databases = [];
        this.authenticated = false;
        this.domCache = new DOMCache(); // Add DOM cache
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkAuthentication();
    }

    async checkAuthentication() {
        try {
            const response = await fetch('/api/auth/check');
            const data = await response.json();
            
            if (data.authenticated) {
                this.authenticated = true;
                
                // Загружаем базы данных сразу после аутентификации
                await this.loadDatabasesData();
                
                // Now restore the current page after authentication is confirmed
                this.restoreCurrentPage();
            } else {
                this.showPage('login');
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            notificationSystem.addNotification(
                'Ошибка аутентификации', 
                'Не удалось проверить статус входа', 
                'error'
            );
            this.showPage('login');
        } finally {
            // Hide loading screen and show app
            this.hideLoadingScreen();
        }
    }

    hideLoadingScreen() {
        const loadingScreen = this.domCache.get('#loadingScreen');
        const appContainer = this.domCache.get('#appContainer');
        
        if (loadingScreen && appContainer) {
            loadingScreen.classList.add('hidden');
            appContainer.classList.add('loaded');
            
            // Remove loading screen after animation
            setTimeout(() => {
                loadingScreen.style.display = 'none';
            }, 300);
        }
    }

    restoreCurrentPage() {
        if (!this.authenticated) return;
        
        // Get saved page from localStorage or URL hash
        const savedPage = localStorage.getItem('currentPage') || window.location.hash.slice(1);
        const savedTab = localStorage.getItem('currentTab');
        
        if (savedPage && savedPage !== 'login') {
            this.showPage(savedPage);
            
            // Restore tab if it was saved
            if (savedTab) {
                setTimeout(() => {
                    this.showTab(savedTab);
                }, 100);
            }
        } else {
            // Default to dashboard if no saved page
            this.showPage('dashboard');
        }
    }

    bindEvents() {
        // Navigation links
        document.addEventListener('click', (e) => {
            const navLink = e.target.closest('.nav-link');
            if (navLink && navLink.dataset.page) {
                e.preventDefault();
                
                // Close mobile menu if open
                if (window.mobileMenu && window.mobileMenu.isOpen) {
                    window.mobileMenu.close();
                }
                
                this.showPage(navLink.dataset.page);
                
                // Reinitialize mobile menu after page change
                setTimeout(() => {
                    if (window.mobileMenu) {
                        window.mobileMenu.reinitialize();
                    }
                }, 200);
            }

            // Tab navigation for bots page
            const tab = e.target.closest('.tab');
            if (tab && tab.dataset.tab) {
                e.preventDefault();
                this.showTab(tab.dataset.tab);
            }
        });

        // Form submissions
        document.addEventListener('submit', (e) => {
            if (e.target.id === 'loginForm') {
                e.preventDefault();
                this.handleLogin();
            } else if (e.target.id === 'createBotForm') {
                e.preventDefault();
                this.handleCreateBot();
            } else if (e.target.id === 'editBotForm') {
                e.preventDefault();
                this.handleEditBot();
            }
        });

        // Checkbox interactions
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('checkbox')) {
                this.toggleCheckbox(e.target);
            }
        });

        // Settings form
        document.getElementById('settingsForm')?.addEventListener('submit', (e) => {
            this.handleSettingsSubmit(e);
        });

        // Support chat form (will be attached when help page loads)
        this.attachChatHandlers();

        // Dashboard period selector
        const periodSelector = this.domCache.get('dashboardPeriod');
        if (periodSelector) {
            periodSelector.addEventListener('change', (e) => {
                this.loadDashboardData();
                // Reinitialize menus after period change
                setTimeout(() => {
                    if (notificationSystem) {
                        notificationSystem.reinitializeForDashboard();
                    }
                }, 800);
            });
        }

        // Dashboard refresh button
        const refreshButton = this.domCache.get('refreshDashboard');
        if (refreshButton) {
            refreshButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.loadDashboardData();
                this.showNotification('Dashboard обновлен', 'success');
                // Reinitialize menus after refresh
                setTimeout(() => {
                    if (notificationSystem) {
                        notificationSystem.reinitializeForDashboard();
                    }
                }, 800);
            });
        }
    }

    showPage(pageId) {
        // Clear DOM cache when switching pages to prevent memory leaks
        if (this.currentPage !== pageId) {
            this.domCache.clear();
        }
        
        // Hide all pages - optimized with cached selectors
        this.pages.forEach(page => {
            const pageElement = this.domCache.get(`#${page}`);
            if (pageElement) {
                pageElement.style.display = 'none';
            }
        });

        // Show selected page
        const targetPage = this.domCache.get(`#${pageId}`);
        if (targetPage) {
            targetPage.style.display = 'flex';
            this.currentPage = pageId;
            this.updateNavigation();

            // Save current page to localStorage (except login page)
            if (pageId !== 'login') {
                localStorage.setItem('currentPage', pageId);
                // Update URL hash
                window.location.hash = pageId;
            }

            // Re-initialize mobile menu immediately
            if (window.mobileMenu) {
                window.mobileMenu.reinitialize();
            }

            // Re-initialize notification system for the new page
            setTimeout(() => {
                notificationSystem.initializeUserMenus();
                if (window.mobileMenu) {
                    window.mobileMenu.reinitialize();
                }
            }, 100);

            // Load data when switching to specific pages
            if (pageId === 'bots') {
                // Загружаем и боты и базы данных для правильного отображения
                Promise.all([
                    this.loadBotsData(),
                    this.loadDatabasesData()
                ]).catch(error => {
                    console.error('Error loading bots page data:', error);
                });
            } else if (pageId === 'dashboard') {
                this.loadDashboardData();
                // Dashboard needs special handling because it might modify DOM
                setTimeout(() => {
                    notificationSystem.reinitializeForDashboard();
                }, 500);
            } else if (pageId === 'databases') {
                this.loadDatabasesData();
            } else if (pageId === 'debug') {
                this.loadDebugData();
            } else if (pageId === 'settings') {
                this.loadSettingsData();
            } else if (pageId === 'bot-settings') {
                // Восстанавливаем состояние редактируемого бота
                this.restoreBotEditingState();
            } else if (pageId === 'help') {
                // Attach chat handlers when help page loads
                setTimeout(() => this.attachChatHandlers(), 100);
            }
            
            // Final mobile menu reinitialize for any page
            setTimeout(() => {
                if (window.mobileMenu) {
                    window.mobileMenu.reinitialize();
                    console.log('📱 Final mobile menu reinit for page:', pageId);
                }
            }, 300);
        }
    }

    showTab(tabId) {
        // Hide all tab contents
        document.querySelectorAll('.tab-content').forEach(content => {
            content.style.display = 'none';
        });

        // Show selected tab content
        const targetContent = document.getElementById(tabId + '-content');
        if (targetContent) {
            targetContent.style.display = 'block';
        }

        // Update tab styles
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.tab === tabId) {
                tab.classList.add('active');
            }
        });

        // Save current tab to localStorage
        localStorage.setItem('currentTab', tabId);
    }

    updateNavigation() {
        // Update active nav links
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
            if (link.dataset.page === this.currentPage) {
                link.classList.add('active');
            }
        });
    }

    async handleLogin() {
        const email = this.domCache.get('#email').value;
        const password = this.domCache.get('#password').value;
        
        if (!email || !password) {
            this.showNotification('Пожалуйста, заполните все поля', 'error');
            return;
        }

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (data.success) {
                this.authenticated = true;
                await this.loadDatabasesData();
                this.showPage('dashboard');
                
                // Add welcome notifications only after successful login
                setTimeout(() => {
                    notificationSystem.addNotification(
                        'Добро пожаловать!', 
                        'Система уведомлений активирована', 
                        'success'
                    );
                    
                    notificationSystem.addNotification(
                        'Информация', 
                        'Нажмите на колокольчик чтобы посмотреть уведомления', 
                        'info'
                    );
                }, 1000);
            } else {
                this.showNotification(data.message || 'Ошибка входа', 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showNotification('Ошибка подключения к серверу', 'error');
        }
    }

    async handleCreateBot() {
        // Cache form elements for better performance
        const formData = {
            name: this.domCache.get('#botName').value?.trim(),
            tag: this.domCache.get('#botTag').value?.trim(),
            description: this.domCache.get('#botDescription').value?.trim(),
            telegram_token: this.domCache.get('#telegramToken').value?.trim(),
            api_url: this.domCache.get('#apiUrl').value?.trim(),
            api_key: this.domCache.get('#apiKey').value?.trim(),
            ai_model: this.domCache.get('#aiModel').value?.trim(),
            database_id: this.domCache.get('#database').value?.trim(),
            system_prompt: this.domCache.get('#systemPrompt').value?.trim(),
            is_active: this.domCache.get('#isActiveCreate').classList.contains('checked')
        };

        // Validation with cached element focus
        if (!formData.name) {
            this.showNotification('Название бота обязательно', 'error');
            this.domCache.get('#botName').focus();
            return;
        }

        if (!formData.telegram_token) {
            this.showNotification('Telegram токен обязателен', 'error');
            this.domCache.get('#telegramToken').focus();
            return;
        }

        if (!formData.ai_model) {
            this.showNotification('Модель AI обязательна', 'error');
            this.domCache.get('#aiModel').focus();
            return;
        }

        if (!formData.api_key) {
            this.showNotification('API ключ обязателен', 'error');
            this.domCache.get('#apiKey').focus();
            return;
        }

        try {
            const response = await fetch('/api/bots', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (data.success) {
                this.showNotification('🤖 Бот создан успешно!', 'success');
                this.clearCreateForm();
                this.loadBotsData();

                // Get bot info immediately after creation
                if (data.botId) {
                    setTimeout(async () => {
                        await fetch(`/api/bots/${data.botId}/refresh-info`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' }
                        });
                        this.loadBotsData();
                    }, 1000);
                    }
            } else {
                this.showNotification(data.message || 'Ошибка создания бота', 'error');
            }
        } catch (error) {
            console.error('Error creating bot:', error);
            this.showNotification('Ошибка подключения к серверу', 'error');
        }
    }

    async handleEditBot() {
        const botId = document.querySelector('#editBotForm').dataset.botId;
        if (!botId) return;

        const memoryEnabledCheckbox = document.querySelector('#memoryEnabledEdit');
        const memoryEnabled = memoryEnabledCheckbox ? memoryEnabledCheckbox.classList.contains('checked') : false;
        const memoryCount = parseInt(document.querySelector('#editMemoryCount')?.value) || 5;
        
        console.log('Memory settings on save:', {
            memoryEnabled,
            memoryCount,
            checkboxElement: memoryEnabledCheckbox,
            checkboxClasses: memoryEnabledCheckbox?.classList.toString()
        });

        const formData = {
            name: document.querySelector('#editBotName').value,
            tag: document.querySelector('#editBotTag').value,
            description: document.querySelector('#editBotDescription').value,
            telegram_token: document.querySelector('#editTelegramToken').value,
            api_url: document.querySelector('#editApiUrl').value,
            api_key: document.querySelector('#editApiKey').value,
            ai_model: document.querySelector('#editAiModel').value,
            database_id: document.querySelector('#editDatabase').value,
            system_prompt: document.querySelector('#editSystemPrompt').value,
            is_active: document.querySelector('#isActiveEdit').classList.contains('checked'),
            memory_enabled: memoryEnabled,
            memory_messages_count: memoryCount
        };

        try {
            const response = await fetch(`/api/bots/${botId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (data.success) {
                this.showNotification('Настройки бота сохранены!', 'success');
                // Очищаем состояние редактирования
                localStorage.removeItem('currentEditingBotId');
                setTimeout(() => {
                    this.showPage('bots');
                    this.loadBotsData();
                }, 1000);
            } else {
                this.showNotification('Ошибка сохранения', 'error');
            }
        } catch (error) {
            console.error('Edit bot error:', error);
            this.showNotification('Ошибка сохранения', 'error');
        }
    }

    async loadDashboardData() {
        try {
            // Load main stats
            const statsResponse = await fetch('/api/dashboard/stats');
            const stats = await statsResponse.json();
            
            // Update metrics
            this.updateMetrics(stats);
            
            // Load chart data
            const period = this.domCache.get('dashboardPeriod')?.value || '24h';
            await Promise.all([
                this.loadMessagesChart(period),
                this.loadAiRequestsChart(period),
                this.loadSystemMetrics()
            ]);
            
            // Load active bots list
            this.loadActiveBotsList();
            
            // Ensure menus work after all dashboard data is loaded
            setTimeout(() => {
                if (notificationSystem) {
                    notificationSystem.reinitializeForDashboard();
                }
            }, 1000);
            
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
            this.showNotification('Ошибка загрузки данных dashboard', 'error');
        }
    }

    updateMetrics(stats) {
        // Update metrics cards
        const elements = {
            totalBots: this.domCache.get('totalBots'),
            activeBots: this.domCache.get('activeBots'),
            totalMessages: this.domCache.get('totalMessages'),
            totalAiRequests: this.domCache.get('totalAiRequests'),
            systemUptime: this.domCache.get('systemUptime'),
            systemStatus: this.domCache.get('systemStatus'),
            messageChange: this.domCache.get('messageChange'),
            aiRequestsChange: this.domCache.get('aiRequestsChange')
        };

        if (elements.totalBots) elements.totalBots.textContent = stats.totalBots || 0;
        if (elements.activeBots) elements.activeBots.textContent = `${stats.runningBots || 0} активных`;
        if (elements.totalMessages) elements.totalMessages.textContent = this.formatNumber(stats.totalRequests || 0);
        if (elements.totalAiRequests) elements.totalAiRequests.textContent = this.formatNumber(stats.apiCalls || 0);
        
        // Format uptime
        if (elements.systemUptime && stats.uptime) {
            const hours = Math.floor(stats.uptime / (1000 * 60 * 60));
            const minutes = Math.floor((stats.uptime % (1000 * 60 * 60)) / (1000 * 60));
            elements.systemUptime.textContent = `${hours}h ${minutes}m`;
        }

        // Update system indicators
        const aiStatusIndicator = this.domCache.get('aiStatusIndicator');
        if (aiStatusIndicator) {
            const hasAiCalls = (stats.apiCalls || 0) > 0;
            aiStatusIndicator.className = `status-indicator ${hasAiCalls ? 'active' : 'warning'}`;
        }
    }

    async loadMessagesChart(period = '24h') {
        try {
            const response = await fetch(`/api/dashboard/charts/messages?period=${period}`);
            const data = await response.json();
            
            const ctx = this.domCache.get('messagesChart');
            if (!ctx) return;

            // Destroy existing chart
            if (this.charts?.messagesChart) {
                this.charts.messagesChart.destroy();
            }

            this.charts = this.charts || {};
            this.charts.messagesChart = new Chart(ctx, {
                type: 'line',
                data: data,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            },
                            ticks: {
                                color: '#666'
                            }
                        },
                        x: {
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            },
                            ticks: {
                                color: '#666'
                            }
                        }
                    },
                    elements: {
                        point: {
                            radius: 4,
                            hoverRadius: 8
                        }
                    },
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    }
                }
            });
        } catch (error) {
            console.error('Failed to load messages chart:', error);
        }
    }

    async loadAiRequestsChart(period = '24h') {
        try {
            const response = await fetch(`/api/dashboard/charts/ai-requests?period=${period}`);
            const data = await response.json();
            
            const ctx = this.domCache.get('aiRequestsChart');
            if (!ctx) return;

            // Destroy existing chart
            if (this.charts?.aiRequestsChart) {
                this.charts.aiRequestsChart.destroy();
            }

            this.charts = this.charts || {};
            this.charts.aiRequestsChart = new Chart(ctx, {
                type: 'line',
                data: data,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            },
                            ticks: {
                                color: '#666'
                            }
                        },
                        x: {
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            },
                            ticks: {
                                color: '#666'
                            }
                        }
                    },
                    elements: {
                        point: {
                            radius: 4,
                            hoverRadius: 8
                        }
                    },
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    }
                }
            });
        } catch (error) {
            console.error('Failed to load AI requests chart:', error);
        }
    }

    async loadSystemMetrics() {
        try {
            const response = await fetch('/api/dashboard/charts/system');
            const data = await response.json();
            
            // Update system indicators
            const memoryUsage = this.domCache.get('memoryUsage');
            const successRate = this.domCache.get('successRate');
            const totalRequests = this.domCache.get('totalRequests');
            const failedRequests = this.domCache.get('failedRequests');

            if (memoryUsage) memoryUsage.textContent = `${data.memory.used}MB`;
            if (successRate) successRate.textContent = `${data.requests.successRate}%`;
            if (totalRequests) totalRequests.textContent = this.formatNumber(data.requests.total);
            if (failedRequests) failedRequests.textContent = this.formatNumber(data.requests.failed);

            // Update performance bars
            this.updatePerformanceBars(data);

            // Load system chart (doughnut for memory usage)
            const ctx = this.domCache.get('systemChart');
            if (ctx) {
                // Destroy existing chart
                if (this.charts?.systemChart) {
                    this.charts.systemChart.destroy();
                }

                this.charts = this.charts || {};
                this.charts.systemChart = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: ['Используется', 'Свободно'],
                        datasets: [{
                            data: [data.memory.used, data.memory.total - data.memory.used],
                            backgroundColor: [
                                'rgba(59, 130, 246, 0.8)',
                                'rgba(59, 130, 246, 0.2)'
                            ],
                            borderWidth: 0
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                display: false
                            }
                        },
                        cutout: '70%'
                    }
                });
            }

        } catch (error) {
            console.error('Failed to load system metrics:', error);
        }
    }

    updatePerformanceBars(data) {
        // Success rate bar
        const successBar = this.domCache.get('successBar');
        const successValue = this.domCache.get('successValue');
        if (successBar && successValue) {
            const successRate = data.requests.successRate;
            successBar.style.width = `${successRate}%`;
            successValue.textContent = `${successRate}%`;
        }

        // Memory usage bar
        const memoryBar = this.domCache.get('memoryBar');
        const memoryValue = this.domCache.get('memoryValue');
        if (memoryBar && memoryValue) {
            const memoryPercentage = data.memory.percentage;
            memoryBar.style.width = `${memoryPercentage}%`;
            memoryValue.textContent = `${memoryPercentage}%`;
        }

        // Active bots bar
        const botsBar = this.domCache.get('botsBar');
        const botsValue = this.domCache.get('botsValue');
        if (botsBar && botsValue) {
            // Assuming max 10 bots for percentage calculation
            const botsPercentage = Math.min((data.activeBots / 10) * 100, 100);
            botsBar.style.width = `${botsPercentage}%`;
            botsValue.textContent = `${data.activeBots}`;
        }
    }

    async loadActiveBotsList() {
        try {
            const response = await fetch('/api/bots');
            const bots = await response.json();
            
            const activeBotsList = this.domCache.get('activeBotsList');
            if (!activeBotsList) return;

            const runningBots = bots.filter(bot => bot.is_running);
            
            if (runningBots.length === 0) {
                activeBotsList.innerHTML = '<div class="loading-placeholder">Нет активных ботов</div>';
                return;
            }

            const fragment = document.createDocumentFragment();
            runningBots.forEach(bot => {
                const botItem = document.createElement('div');
                botItem.className = 'bot-item';
                botItem.innerHTML = `
                    <span class="bot-name">${bot.name}</span>
                    <span class="bot-status">
                        <div class="status-indicator active"></div>
                        Активен
                    </span>
                `;
                fragment.appendChild(botItem);
            });

            activeBotsList.innerHTML = '';
            activeBotsList.appendChild(fragment);

        } catch (error) {
            console.error('Failed to load active bots:', error);
        }
    }

    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }

    async loadBotsData() {
        try {
            const response = await fetch('/api/bots');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            this.bots = Array.isArray(data) ? data : [];
            this.renderBotsTable();
        } catch (error) {
            console.error('Failed to load bots:', error);
            this.showNotification('Ошибка загрузки ботов: ' + error.message, 'error');
            this.bots = [];
            this.renderBotsTable();
        }
    }

    async loadDatabasesData() {
        try {
            const response = await fetch('/api/databases');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            this.databases = Array.isArray(data) ? data : [];
            this.updateDatabaseSelects();
            this.renderDatabasesTable();
        } catch (error) {
            console.error('Failed to load databases:', error);
            this.showNotification('Ошибка загрузки баз данных: ' + error.message, 'error');
            this.databases = [];
            this.updateDatabaseSelects();
            this.renderDatabasesTable();
        }
    }

    async loadSettingsData() {
        try {
            const response = await fetch('/api/settings');
            const settings = await response.json();
            
            // Populate form fields
            settings.forEach(setting => {
                if (setting.key === 'support_ai_enabled') {
                    const checkbox = document.getElementById('supportEnabled');
                    const statusText = document.getElementById('activationStatus');
                    if (checkbox && statusText) {
                        if (setting.value === 'true') {
                            checkbox.classList.add('checked');
                            statusText.textContent = 'AI поддержка активна';
                            statusText.className = 'activation-status active';
                        } else {
                            checkbox.classList.remove('checked');
                            statusText.textContent = 'AI поддержка отключена';
                            statusText.className = 'activation-status inactive';
                        }
                    }
                } else if (setting.key === 'support_ai_api_url') {
                    const input = document.getElementById('supportApiUrl');
                    if (input) input.value = setting.value || '';
                } else if (setting.key === 'support_ai_api_key') {
                    const input = document.getElementById('supportApiKey');
                    if (input) input.value = setting.value || '';
                } else if (setting.key === 'support_ai_model') {
                    const input = document.getElementById('supportAiModel');
                    if (input) input.value = setting.value || '';
                }
            });
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    async handleSettingsSubmit(event) {
        event.preventDefault();
        
        const supportEnabled = document.getElementById('supportEnabled').classList.contains('checked');
        const supportApiUrl = document.getElementById('supportApiUrl').value;
        const supportApiKey = document.getElementById('supportApiKey').value;
        const supportAiModel = document.getElementById('supportAiModel').value;
        
        const settings = [
            { key: 'support_ai_enabled', value: supportEnabled ? 'true' : 'false' },
            { key: 'support_ai_api_url', value: supportApiUrl },
            { key: 'support_ai_api_key', value: supportApiKey },
            { key: 'support_ai_model', value: supportAiModel }
        ];

        try {
            const response = await fetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings })
            });

            const data = await response.json();

            if (data.success) {
                this.showNotification('Настройки сохранены!', 'success');
                
                // Update status text
                const statusText = document.getElementById('activationStatus');
                if (statusText) {
                    if (supportEnabled) {
                        statusText.textContent = 'AI поддержка активна';
                        statusText.className = 'activation-status active';
                    } else {
                        statusText.textContent = 'AI поддержка отключена';
                        statusText.className = 'activation-status inactive';
                    }
                }
            } else {
                this.showNotification('Ошибка сохранения настроек', 'error');
            }
        } catch (error) {
            console.error('Settings save error:', error);
            this.showNotification('Ошибка сохранения настроек', 'error');
        }
    }

    renderDatabasesTable() {
        const tbody = this.domCache.get('#databasesTable tbody');
        if (!tbody) return;

        if (!Array.isArray(this.databases) || this.databases.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 40px; color: var(--text-secondary);">
                        <div style="display: flex; flex-direction: column; align-items: center; gap: 16px;">
                            <svg viewBox="0 0 24 24" style="width: 48px; height: 48px; stroke: currentColor; opacity: 0.5;">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                            </svg>
                            <div>
                                <div style="font-weight: 600; margin-bottom: 8px;">Баз данных пока нет</div>
                                <div style="font-size: 14px;">Создайте первую базу данных для ваших ботов</div>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        // Optimized rendering with fragment for better performance
        const fragment = document.createDocumentFragment();
            const typeColors = {
                'text': 'var(--primary-green)',
            'json': 'var(--primary-blue)'
            };

            const typeLabels = {
                'text': 'Текстовая',
            'json': 'JSON'
        };

        this.databases.forEach(db => {
            const statusClass = 'status-online';
            const statusText = 'Доступна';
            const updatedDate = new Date(db.updated_at).toLocaleDateString('ru-RU');
            const size = db.size_mb < 1 ? `${(db.size_mb * 1024).toFixed(0)} КБ` : `${db.size_mb.toFixed(1)} МБ`;

            const row = document.createElement('tr');
            row.innerHTML = `
                    <td>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div class="db-type-icon db-type-${db.type}">
                                <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; stroke: white;"><path stroke-linecap="round" stroke-linejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>
                            </div>
                            <div>
                                <div style="font-weight: 600; color: var(--text-primary);">${db.name}</div>
                                <div style="font-size: 12px; color: var(--text-secondary);">${db.description || 'Без описания'}</div>
                            </div>
                        </div>
                    </td>
                    <td class="hidden-mobile">${typeLabels[db.type]}</td>
                    <td class="hidden-mobile">${size}</td>
                    <td class="hidden-tablet">${updatedDate}</td>
                    <td><span class="${statusClass}">${statusText}</span></td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn btn-small btn-secondary" onclick="editDatabase('${db.id}')">
                            Редактировать
                            </button>
                        </div>
                    </td>
            `;
            fragment.appendChild(row);
        });

        tbody.innerHTML = '';
        tbody.appendChild(fragment);
    }

    renderBotsTable() {
        // Check if mobile (768px or less)
        const isMobile = window.innerWidth <= 768;
        
        if (isMobile) {
            this.renderMobileBotCards();
            return;
        }
        
        const tbody = document.querySelector('#all-bots-content table tbody');
        if (!tbody) return;

        if (!Array.isArray(this.bots) || this.bots.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 40px; color: var(--text-secondary);">
                        <div style="display: flex; flex-direction: column; align-items: center; gap: 16px;">
                            <svg viewBox="0 0 24 24" style="width: 48px; height: 48px; stroke: currentColor; opacity: 0.5;">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            <div>
                                <div style="font-weight: 600; margin-bottom: 8px;">Ботов пока нет</div>
                                <div style="font-size: 14px;">Создайте своего первого бота на вкладке "Создать бота"</div>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = this.bots.map(bot => {
            const telegramUsername = bot.telegram_username ? `@${bot.telegram_username}` : (bot.username || '@bot');
            const telegramName = bot.telegram_first_name || bot.name;
            const hasRealTelegramInfo = bot.telegram_username && bot.telegram_first_name;
            
            // Найдем название базы данных
            const database = this.databases.find(db => db.id === bot.database_id);
            const databaseName = database ? database.name : (bot.database_id ? 'База не найдена' : 'Не выбрана');
            
            return `
                <tr>
                    <td>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="width: 40px; height: 40px; background: var(--primary-green); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600;">
                                ${telegramName.charAt(0).toUpperCase()}
                            </div>
                            <div style="flex: 1;">
                                <div style="font-weight: 600; color: var(--text-primary);">${bot.name}</div>
                                <div style="font-size: 12px; color: var(--text-secondary); display: flex; align-items: center; gap: 8px;">
                                    <span>${telegramUsername}</span>
                                    ${hasRealTelegramInfo ? `
                                        <a href="https://t.me/${bot.telegram_username}" target="_blank" 
                                           class="telegram-link"
                                           title="Перейти к боту в Telegram">
                                            <svg viewBox="0 0 24 24" style="width: 10px; height: 10px; stroke: currentColor;">
                                                <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                            </svg>
                                            Перейти
                                        </a>
                                    ` : `
                                        <button onclick="refreshBotInfo('${bot.id}')" 
                                                class="refresh-bot-info"
                                                title="Получить информацию о боте из Telegram">
                                            Обновить
                                        </button>
                                    `}
                                </div>
                            </div>
                        </div>
                    </td>
                    <td><span class="status-${bot.is_running ? 'online' : 'offline'}">${bot.is_running ? 'Запущен' : 'Остановлен'}</span></td>
                    <td class="hidden-mobile" style="font-family: monospace; font-size: 12px;">${bot.api_key ? bot.api_key.substring(0, 8) + '***' : 'Не указан'}</td>
                    <td class="hidden-mobile">${bot.ai_model || 'Не указана'}</td>
                    <td class="hidden-tablet">${databaseName}</td>
                    <td class="hidden-tablet">${new Date(bot.created_at).toLocaleDateString()}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn btn-small btn-${bot.is_running ? 'danger' : 'success'}" onclick="toggleBot('${bot.id}', ${bot.is_running})">
                                ${bot.is_running ? 'Остановить' : 'Запустить'}
                            </button>
                            <button class="btn btn-small btn-secondary" onclick="editBot('${bot.id}')">Настроить</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    renderMobileBotCards() {
        // Create or find mobile container
        let mobileContainer = document.querySelector('#all-bots-content .mobile-bot-container');
        if (!mobileContainer) {
            // Hide table and filters
            const tableDiv = document.querySelector('#all-bots-content > div');
            if (tableDiv) {
                tableDiv.style.display = 'none';
            }
            
            // Create mobile container
            mobileContainer = document.createElement('div');
            mobileContainer.className = 'mobile-bot-container';
            document.querySelector('#all-bots-content').appendChild(mobileContainer);
        }

        if (!Array.isArray(this.bots) || this.bots.length === 0) {
            mobileContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 16px;">
                        <svg viewBox="0 0 24 24" style="width: 48px; height: 48px; stroke: currentColor; opacity: 0.5;">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <div>
                            <div style="font-weight: 600; margin-bottom: 8px;">Ботов пока нет</div>
                            <div style="font-size: 14px;">Создайте своего первого бота на вкладке "Создать бота"</div>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        mobileContainer.innerHTML = this.bots.map(bot => {
            const telegramUsername = bot.telegram_username ? `@${bot.telegram_username}` : (bot.username || '@bot');
            const telegramName = bot.telegram_first_name || bot.name;
            const hasRealTelegramInfo = bot.telegram_username && bot.telegram_first_name;
            
            // Найдем название базы данных
            const database = this.databases.find(db => db.id === bot.database_id);
            const databaseName = database ? database.name : (bot.database_id ? 'База не найдена' : 'Не выбрана');
            
            return `
                <div class="bot-card-mobile">
                    <div class="bot-header">
                        <div class="bot-avatar">${telegramName.charAt(0).toUpperCase()}</div>
                        <div class="bot-info">
                            <h4>${bot.name}</h4>
                            <p>${telegramUsername}</p>
                        </div>
                    </div>
                    
                    <div class="bot-status">
                        <span class="status-${bot.is_running ? 'online' : 'offline'}">${bot.is_running ? 'Запущен' : 'Остановлен'}</span>
                        ${hasRealTelegramInfo ? `
                            <a href="https://t.me/${bot.telegram_username}" target="_blank" 
                               class="telegram-link"
                               style="margin-left: auto;"
                               title="Перейти к боту в Telegram">
                                <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; stroke: currentColor;">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                </svg>
                            </a>
                        ` : `
                            <button onclick="refreshBotInfo('${bot.id}')" 
                                    class="refresh-bot-info"
                                    style="margin-left: auto;"
                                    title="Получить информацию о боте из Telegram">
                                Обновить
                            </button>
                        `}
                    </div>
                    
                    <div class="bot-details">
                        <div class="bot-detail">
                            <div class="bot-detail-label">Модель AI</div>
                            <div class="bot-detail-value">${bot.ai_model || 'Не указана'}</div>
                        </div>
                        <div class="bot-detail">
                            <div class="bot-detail-label">База данных</div>
                            <div class="bot-detail-value">${databaseName}</div>
                        </div>
                        <div class="bot-detail">
                            <div class="bot-detail-label">API ключ</div>
                            <div class="bot-detail-value">${bot.api_key ? bot.api_key.substring(0, 8) + '***' : 'Не указан'}</div>
                        </div>
                        <div class="bot-detail">
                            <div class="bot-detail-label">Дата создания</div>
                            <div class="bot-detail-value">${new Date(bot.created_at).toLocaleDateString()}</div>
                        </div>
                    </div>
                    
                    <div class="bot-actions">
                        <button class="btn btn-${bot.is_running ? 'danger' : 'success'}" onclick="toggleBot('${bot.id}', ${bot.is_running})">
                            ${bot.is_running ? 'Остановить' : 'Запустить'}
                        </button>
                        <button class="btn btn-secondary" onclick="editBot('${bot.id}')">Настроить</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateDatabaseSelects() {
        const selects = this.domCache.getAll('#database, #editDatabase');
        if (!selects.length) return;
        
        // Create options fragment for reuse
        const createOptions = () => {
            const fragment = document.createDocumentFragment();
            
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = 'Выберите базу данных';
            fragment.appendChild(defaultOption);
            
            if (Array.isArray(this.databases) && this.databases.length > 0) {
                this.databases.forEach(db => {
                    const option = document.createElement('option');
                    option.value = db.id;
                    option.textContent = db.name;
                    fragment.appendChild(option);
                });
            } else {
                const noDataOption = document.createElement('option');
                noDataOption.value = '';
                noDataOption.textContent = 'Нет доступных баз данных';
                noDataOption.disabled = true;
                fragment.appendChild(noDataOption);
            }
            
            return fragment;
        };

        selects.forEach(select => {
            const currentValue = select.value;
            select.innerHTML = '';
            select.appendChild(createOptions());
            
            if (currentValue) {
                select.value = currentValue;
            }
        });
    }

    clearCreateForm() {
        const form = document.querySelector('#createBotForm');
        if (form) {
            form.reset();
        }
        
        const activeCheckbox = document.querySelector('#isActiveCreate');
        if (activeCheckbox) {
            activeCheckbox.classList.remove('checked');
        }
        
        // Обновляем селект баз данных
        this.updateDatabaseSelects();
    }

    toggleCheckbox(checkbox) {
        checkbox.classList.toggle('checked');
    }

    attachChatHandlers() {
        // Support chat form
        const chatForm = document.getElementById('chatForm');
        const chatInput = document.getElementById('chatInput');
        
        if (chatForm) {
            chatForm.addEventListener('submit', (e) => {
                e.preventDefault();
                handleSupportChat();
            });
        }
        
        // Auto-resize textarea and handle Enter key
        if (chatInput) {
            chatInput.addEventListener('input', (e) => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            });

            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    chatForm.dispatchEvent(new Event('submit'));
                }
            });
        }
    }

    showNotification(message, type = 'info') {
        // Use the new notification system
        const title = type === 'error' ? 'Ошибка' : 
                     type === 'warning' ? 'Предупреждение' : 
                     type === 'success' ? 'Успешно' : 'Информация';
        
        notificationSystem.addNotification(title, message, type);
    }

    async loadDebugData() {
        try {
            // Load server stats
            const statsResponse = await fetch('/api/debug/stats');
            const stats = await statsResponse.json();
            
            document.getElementById('serverUptime').textContent = stats.uptime.formatted;
            document.getElementById('totalRequests').textContent = stats.totalRequests;
            document.getElementById('apiCalls').textContent = stats.apiCalls;
            document.getElementById('activeBots').textContent = stats.activeBots;
            
            // Load logs
            const level = document.getElementById('logLevel')?.value || '';
            const category = document.getElementById('logCategory')?.value || '';
            
            const logsResponse = await fetch(`/api/debug/logs?limit=100&level=${level}&category=${category}`);
            const logsData = await logsResponse.json();
            
            this.renderLogs(logsData.logs);
            
        } catch (error) {
            console.error('Error loading debug data:', error);
        }
    }

    renderLogs(logs) {
        const console = document.getElementById('debugConsole');
        if (!console) return;
        
        // Reverse order: newest at bottom (normal chronological order)
        const sortedLogs = [...logs].reverse();
        
        console.innerHTML = sortedLogs.map(log => {
            const time = new Date(log.timestamp).toLocaleTimeString('ru-RU');
            const date = new Date(log.timestamp).toLocaleDateString('ru-RU');
            const levelClass = `log-${log.level.toLowerCase()}`;
            
            // Format details if available
            let detailsHtml = '';
            if (log.details && typeof log.details === 'object') {
                const detailsArray = [];
                Object.entries(log.details).forEach(([key, value]) => {
                    if (value !== null && value !== undefined) {
                        detailsArray.push(`${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
                    }
                });
                if (detailsArray.length > 0) {
                    detailsHtml = `
                        <div class="log-details">
                            ${detailsArray.map(detail => `<span class="detail-item">${detail}</span>`).join('')}
                        </div>
                    `;
                }
            }
            
            // Enhanced emoji icons for categories
            const categoryIcons = {
                'SERVER': '🌐',
                'BOT': '🤖', 
                'API': '🔌',
                'AUTH': '🔐',
                'DATABASE': '💾',
                'TELEGRAM': '💬'
            };
            
            const categoryIcon = categoryIcons[log.category] || '📝';
            
            // Level colors and icons
            const levelIcons = {
                'ERROR': '❌',
                'WARNING': '⚠️',
                'SUCCESS': '✅',
                'INFO': 'ℹ️'
            };
            
            const levelIcon = levelIcons[log.level] || '📋';
            
            return `
                <div class="log-entry ${levelClass}" title="${date} ${time}">
                    <div class="log-header">
                    <span class="log-time">${time}</span>
                        <span class="log-level">${levelIcon} ${log.level}</span>
                        <span class="log-category">${categoryIcon} ${log.category}</span>
                    </div>
                    <div class="log-content">
                    <span class="log-message">${log.message}</span>
                        ${detailsHtml}
                    </div>
                </div>
            `;
        }).join('');
        
        // Auto scroll to bottom to show newest logs
        console.scrollTop = console.scrollHeight;
    }

    async restoreBotEditingState() {
        const editingBotId = localStorage.getItem('currentEditingBotId');
        console.log('Restoring bot editing state for ID:', editingBotId);
        
        if (!editingBotId) {
            // Если нет сохраненного ID, перенаправляем на страницу ботов
            console.log('No editing bot ID found, redirecting to bots page');
            this.showPage('bots');
            return;
        }

        try {
            // Убеждаемся что боты и базы данных загружены
            if (!this.bots || this.bots.length === 0) {
                console.log('Loading bots data...');
                await this.loadBotsData();
            }
            if (!this.databases || this.databases.length === 0) {
                console.log('Loading databases data...');
                await this.loadDatabasesData();
            }

            // Находим бота по ID
            const bot = this.bots.find(b => b.id === editingBotId);
            if (!bot) {
                this.showNotification('Редактируемый бот не найден', 'error');
                localStorage.removeItem('currentEditingBotId');
                this.showPage('bots');
                return;
            }

            console.log('Found bot for editing:', bot.name);
            // Заполняем форму данными бота
            this.fillBotEditForm(bot);
        } catch (error) {
            console.error('Error restoring bot editing state:', error);
            this.showNotification('Ошибка восстановления состояния редактирования', 'error');
            localStorage.removeItem('currentEditingBotId');
            this.showPage('bots');
        }
    }

    fillBotEditForm(bot) {
        console.log('Filling bot edit form with data:', bot);

        // Небольшая задержка чтобы убедиться что DOM готов
        setTimeout(() => {
            this.doFillBotEditForm(bot);
        }, 100);
    }

    doFillBotEditForm(bot) {
        // Fill edit form with bot data - with null checks
        const editBotName = document.querySelector('#editBotName');
        const editBotTag = document.querySelector('#editBotTag');
        const editBotDescription = document.querySelector('#editBotDescription');
        const editTelegramToken = document.querySelector('#editTelegramToken');
        const editApiUrl = document.querySelector('#editApiUrl');
        const editApiKey = document.querySelector('#editApiKey');
        const editAiModel = document.querySelector('#editAiModel');
        const editDatabase = document.querySelector('#editDatabase');
        const editSystemPrompt = document.querySelector('#editSystemPrompt');
        
        if (editBotName) editBotName.value = bot.name || '';
        if (editBotTag) editBotTag.value = bot.tag || '';
        if (editBotDescription) editBotDescription.value = bot.description || '';
        if (editTelegramToken) editTelegramToken.value = bot.telegram_token || '';
        if (editApiUrl) editApiUrl.value = bot.api_url || '';
        if (editApiKey) editApiKey.value = bot.api_key || '';
        if (editAiModel) editAiModel.value = bot.ai_model || '';
        if (editDatabase) editDatabase.value = bot.database_id || '';
        if (editSystemPrompt) editSystemPrompt.value = bot.system_prompt || '';
        
        const checkbox = document.querySelector('#isActiveEdit');
        if (checkbox) {
            if (bot.is_active) {
                checkbox.classList.add('checked');
            } else {
                checkbox.classList.remove('checked');
            }
        }
        
        // Set memory settings
        const memoryEnabledCheckbox = document.querySelector('#memoryEnabledEdit');
        const memoryCount = document.querySelector('#editMemoryCount');
        const memoryCountGroup = document.querySelector('#memoryCountGroup');
        
        console.log('fillBotEditForm: Setting memory settings for bot:', bot.name);
        console.log('fillBotEditForm: Bot memory_enabled:', bot.memory_enabled);
        
        if (memoryEnabledCheckbox) {
            if (bot.memory_enabled) {
                console.log('fillBotEditForm: Adding checked class to memory checkbox');
                memoryEnabledCheckbox.classList.add('checked');
                if (memoryCountGroup) {
                    memoryCountGroup.style.opacity = '1';
                    memoryCountGroup.style.pointerEvents = 'auto';
                }
            } else {
                console.log('fillBotEditForm: Removing checked class from memory checkbox');
                memoryEnabledCheckbox.classList.remove('checked');
                if (memoryCountGroup) {
                    memoryCountGroup.style.opacity = '0.5';
                    memoryCountGroup.style.pointerEvents = 'none';
                }
            }
            console.log('fillBotEditForm: Final checkbox classes:', memoryEnabledCheckbox.className);
        }
        
        if (memoryCount) {
            memoryCount.value = bot.memory_messages_count || 5;
        }

        // Store bot ID in form
        const editBotForm = document.querySelector('#editBotForm');
        if (editBotForm) {
            editBotForm.dataset.botId = bot.id;
        }

        console.log('Bot edit form filled successfully');
    }

    // logout method removed - now handled by NotificationSystem
}

// navigation is already declared at the top

// Bot management functions
async function editBot(botId) {
    const bot = navigation.bots.find(b => b.id === botId);
    if (!bot) {
        navigation.showNotification('Бот не найден', 'error');
        return;
    }

    // Убеждаемся что базы данных загружены
    if (!navigation.databases || navigation.databases.length === 0) {
        await navigation.loadDatabasesData();
    }

    // Save current editing bot to localStorage
    localStorage.setItem('currentEditingBotId', botId);

    // Fill form with bot data
    navigation.fillBotEditForm(bot);

    navigation.showPage('bot-settings');
}

async function toggleBot(botId, isRunning) {
    // Найдем кнопку и добавим индикатор загрузки
    const button = document.querySelector(`[onclick*="toggleBot('${botId}"]`);
    const originalText = button ? button.textContent : '';
    
    try {
        // Показываем индикатор загрузки на кнопке
        if (button) {
            button.disabled = true;
            button.style.opacity = '0.6';
            button.style.cursor = 'not-allowed';
            button.textContent = isRunning ? '⏹️ Останавливается...' : '▶️ Запускается...';
        }
        
        // Показываем уведомление о начале процесса
        navigation.showNotification(
            isRunning ? '🔄 Бот останавливается...' : '🔄 Бот запускается...', 
            'info'
        );

        const response = await fetch(`/api/bots/${botId}/toggle`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            // Русские уведомления об успехе
            navigation.showNotification(
                isRunning ? '✅ Бот успешно остановлен' : '✅ Бот успешно запущен', 
                'success'
            );
            navigation.loadBotsData();
        } else {
            navigation.showNotification(
                data.message || 'Ошибка управления ботом', 
                'error'
            );
        }
    } catch (error) {
        console.error('Toggle bot error:', error);
        navigation.showNotification(
            `Ошибка ${isRunning ? 'остановки' : 'запуска'} бота: ${error.message}`, 
            'error'
        );
    } finally {
        // Восстанавливаем кнопку
        if (button) {
            button.disabled = false;
            button.style.opacity = '1';
            button.style.cursor = 'pointer';
            button.textContent = originalText;
        }
    }
}

async function refreshBotInfo(botId) {
    try {
        // Show loading state
        const button = event.target;
        const originalText = button.textContent;
        button.textContent = '🔄 Обновление...';
        button.disabled = true;
        button.style.opacity = '0.6';

        const response = await fetch(`/api/bots/${botId}/refresh-info`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            navigation.showNotification(
                `✅ Информация о боте обновлена: @${data.botInfo.username}`, 
                'success'
            );
            navigation.loadBotsData();
        } else {
            navigation.showNotification(data.error || 'Ошибка получения информации о боте', 'error');
        }
    } catch (error) {
        console.error('Refresh bot info error:', error);
        navigation.showNotification('Ошибка получения информации о боте', 'error');
    } finally {
        // Restore button state
        const button = event.target;
        button.textContent = originalText;
        button.disabled = false;
        button.style.opacity = '1';
    }
}

async function deleteBot() {
    const botId = document.querySelector('#editBotForm').dataset.botId;
    if (!botId) return;

    if (confirm('Вы уверены, что хотите удалить этого бота?')) {
        try {
            const response = await fetch(`/api/bots/${botId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                navigation.showNotification('Бот успешно удален', 'success');
                // Очищаем состояние редактирования
                localStorage.removeItem('currentEditingBotId');
                navigation.showPage('bots');
                navigation.loadBotsData();
            } else {
                navigation.showNotification('Ошибка удаления бота', 'error');
            }
        } catch (error) {
            console.error('Delete bot error:', error);
            navigation.showNotification('Ошибка удаления бота', 'error');
        }
    }
}

function clearForm() {
    navigation.clearCreateForm();
}

function cancelEdit() {
    // Очищаем состояние редактирования
    localStorage.removeItem('currentEditingBotId');
    navigation.showPage('bots');
}

function createDatabase() {
    showCreateDatabaseModal();
}

// Database management functions
let currentDatabaseId = null;

function showCreateDatabaseModal() {
    currentDatabaseId = null;
    document.getElementById('databaseModalTitle').textContent = 'Создать базу данных';
    document.getElementById('databaseSubmitBtn').textContent = 'Создать базу данных';
    document.getElementById('deleteDatabaseBtn').style.display = 'none';
    
    // Clear form
    document.getElementById('databaseForm').reset();
    document.getElementById('contentGroup').style.display = 'none';
    
    document.getElementById('databaseModal').style.display = 'flex';
}

function closeDatabaseModal() {
    document.getElementById('databaseModal').style.display = 'none';
    currentDatabaseId = null;
}

async function editDatabase(dbId) {
    try {
        const response = await fetch(`/api/databases/${dbId}`);
        const database = await response.json();
        
        if (!['text', 'json'].includes(database.type)) {
            navigation.showNotification('Этот тип базы данных пока в разработке', 'warning');
            return;
        }
        
        currentDatabaseId = dbId;
        document.getElementById('databaseModalTitle').textContent = 'Редактировать базу данных';
        document.getElementById('databaseSubmitBtn').textContent = 'Сохранить изменения';
        document.getElementById('deleteDatabaseBtn').style.display = 'inline-block';
        
        // Fill form
        document.getElementById('dbName').value = database.name;
        document.getElementById('dbType').value = database.type;
        document.getElementById('dbDescription').value = database.description || '';
        document.getElementById('dbContent').value = database.content || '';
        
        // Disable type selection for existing databases
        document.getElementById('dbType').disabled = true;
        
        handleDatabaseTypeChange();
        
        document.getElementById('databaseModal').style.display = 'flex';
        
    } catch (error) {
        console.error('Error loading database:', error);
        navigation.showNotification('Ошибка загрузки базы данных', 'error');
    }
}

function handleDatabaseTypeChange() {
    const type = document.getElementById('dbType').value;
    const contentGroup = document.getElementById('contentGroup');
    const contentLabel = document.getElementById('contentLabel');
    const contentHelp = document.getElementById('contentHelp');
    const contentField = document.getElementById('dbContent');
    
    if (type === 'text') {
        contentGroup.style.display = 'block';
        contentLabel.textContent = 'Содержимое базы знаний';
        contentField.placeholder = 'Введите текстовую информацию, которая будет передаваться AI модели как база знаний...';
        contentHelp.innerHTML = `
            <strong>Текстовая база знаний</strong><br>
            Здесь можно хранить любую текстовую информацию: FAQ, инструкции, правила, справочные материалы.
            Эта информация будет автоматически добавляться к системному промпту бота.
        `;
        
        if (!contentField.value && !currentDatabaseId) {
            contentField.value = `Это база знаний для бота.

Здесь можно хранить:
- Часто задаваемые вопросы и ответы
- Инструкции для пользователей  
- Правила и политики
- Справочную информацию
- Любые другие текстовые данные

Вся эта информация будет доступна AI модели при ответах пользователям.`;
        }
        
    } else if (type === 'json') {
        contentGroup.style.display = 'block';
        contentLabel.textContent = 'JSON данные';
        contentField.placeholder = 'Введите JSON данные...';
        contentHelp.innerHTML = `
            <strong>JSON база данных</strong><br>
            Структурированные данные в формате JSON: товары, пользователи, настройки и т.д.
            AI модель сможет анализировать и использовать эти данные для ответов.
        `;
        
        if (!contentField.value && !currentDatabaseId) {
            contentField.value = `{
  "products": [
    {
      "id": 1,
      "name": "Товар 1",
      "price": 1000,
      "category": "Электроника"
    }
  ],
  "categories": ["Электроника", "Одежда", "Книги"],
  "settings": {
    "currency": "RUB",
    "language": "ru"
  }
}`;
        }
        
    } else {
        contentGroup.style.display = 'none';
    }
}

async function handleDatabaseSubmit(event) {
    event.preventDefault();
    
    const name = document.getElementById('dbName').value;
    const type = document.getElementById('dbType').value;
    const description = document.getElementById('dbDescription').value;
    const content = document.getElementById('dbContent').value;
    
    if (!name || !type) {
        navigation.showNotification('Заполните обязательные поля', 'error');
        return;
    }
    
    // Validate JSON if type is json
    if (type === 'json' && content) {
        try {
            JSON.parse(content);
        } catch (e) {
            navigation.showNotification('Неверный формат JSON', 'error');
            return;
        }
    }
    
    try {
        const url = currentDatabaseId ? `/api/databases/${currentDatabaseId}` : '/api/databases';
        const method = currentDatabaseId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, type, description, content })
        });
        
        const data = await response.json();
        
        if (data.success) {
            navigation.showNotification(
                currentDatabaseId ? 'База данных обновлена!' : 'База данных создана!', 
                'success'
            );
            closeDatabaseModal();
            navigation.loadDatabasesData();
        } else {
            navigation.showNotification(data.error || 'Ошибка сохранения', 'error');
        }
        
    } catch (error) {
        console.error('Database save error:', error);
        navigation.showNotification('Ошибка сохранения базы данных', 'error');
    }
}

async function deleteDatabase() {
    if (!currentDatabaseId) return;
    
    if (confirm('Вы уверены, что хотите удалить эту базу данных? Это действие нельзя отменить.')) {
        try {
            const response = await fetch(`/api/databases/${currentDatabaseId}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (data.success) {
                navigation.showNotification('База данных удалена', 'success');
                closeDatabaseModal();
                navigation.loadDatabasesData();
            } else {
                navigation.showNotification(data.error || 'Ошибка удаления', 'error');
            }
            
        } catch (error) {
            console.error('Delete database error:', error);
            navigation.showNotification('Ошибка удаления базы данных', 'error');
        }
    }
}

// Debug functions
function refreshLogs() {
    if (navigation && navigation.currentPage === 'debug') {
        navigation.loadDebugData();
    }
}

function clearLogs() {
    // This would clear server logs - for now just show notification
    navigation.showNotification('Очистка логов в разработке', 'info');
}

function exportLogs() {
    // Export logs to file
    navigation.showNotification('Экспорт логов в разработке', 'info');
}

// Auto-refresh logs when on debug page
let debugAutoRefresh;

function startDebugAutoRefresh() {
    stopDebugAutoRefresh();
    debugAutoRefresh = setInterval(() => {
        const autoRefreshCheckbox = document.getElementById('autoRefresh');
        if (autoRefreshCheckbox && autoRefreshCheckbox.checked && navigation.currentPage === 'debug') {
            navigation.loadDebugData();
        }
    }, 5000); // Refresh every 5 seconds
}

function stopDebugAutoRefresh() {
    if (debugAutoRefresh) {
        clearInterval(debugAutoRefresh);
        debugAutoRefresh = null;
    }
}

// Support Chat Functions
async function handleSupportChat() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Add user message to chat
    addChatMessage(message, 'user');
    input.value = '';
    input.style.height = 'auto';
    
    // Disable send button and show typing
    const sendBtn = document.querySelector('.chat-send-btn');
    sendBtn.disabled = true;
    
    // Add typing indicator
    const typingMessage = addTypingIndicator();
    
    try {
        const response = await fetch('/api/support/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, stream: true })
        });
        
        // Remove typing indicator
        typingMessage.remove();
        
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let aiMessageDiv = addChatMessage('', 'ai');
        let messageText = aiMessageDiv.querySelector('.message-text');
        let fullResponse = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') {
                        return;
                    }
                    
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.content) {
                            fullResponse += parsed.content;
                            messageText.innerHTML = formatMessage(fullResponse);
                            scrollToBottom();
                        }
                    } catch (e) {
                        // Ignore parsing errors for partial data
                    }
                }
            }
        }
    } catch (error) {
        console.error('Chat error:', error);
        if (typingMessage.parentNode) {
            typingMessage.remove();
        }
        addChatMessage('Ошибка соединения. Проверьте настройки AI поддержки.', 'ai');
    } finally {
        // Re-enable send button
        sendBtn.disabled = false;
    }
}

function addChatMessage(text, sender) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${sender}-message`;
    
    const avatarIcon = sender === 'user' 
        ? '<svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>'
        : '<svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>';
    
    const time = new Date().toLocaleTimeString('ru-RU', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    messageDiv.innerHTML = `
        <div class="message-avatar">${avatarIcon}</div>
        <div class="message-content">
            <div class="message-text">${formatMessage(text)}</div>
            <div class="message-time">${time}</div>
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    scrollToBottom();
    
    return messageDiv;
}

function addTypingIndicator() {
    const chatMessages = document.getElementById('chatMessages');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'chat-message ai-message typing';
    typingDiv.innerHTML = `
        <div class="message-avatar">
            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
        </div>
        <div class="message-content">
            <div class="typing-indicator">
                <span>печатает</span>
                <div class="typing-dots">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        </div>
    `;
    chatMessages.appendChild(typingDiv);
    scrollToBottom();
    return typingDiv;
}

function formatMessage(message) {
    if (!message) return '';
    
    // Convert markdown-like formatting to HTML
    let formatted = message
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');
    
    // Wrap in paragraphs if contains line breaks
    if (formatted.includes('</p><p>') || formatted.includes('<br>')) {
        formatted = '<p>' + formatted + '</p>';
    }
    
    // Handle numbered lists
    formatted = formatted.replace(/(\d+\.\s+)(.*?)(?=\d+\.\s+|$)/g, '<li>$2</li>');
    if (formatted.includes('<li>')) {
        formatted = '<ol>' + formatted + '</ol>';
    }
    
    return formatted;
}

function scrollToBottom() {
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}





// Global variables for commands (currentBotId is already declared at the top)
let currentCommandId = null;
let botCommands = [];

// Bot Commands Management
function showBotCommands() {
    // Get current bot ID from the edit form or use first bot as fallback
    const editForm = document.getElementById('editBotForm');
    if (editForm && editForm.dataset.botId) {
        currentBotId = editForm.dataset.botId;
    } else {
        // Fallback to first available bot
        currentBotId = navigation.bots.length > 0 ? navigation.bots[0].id : '1';
    }
    
    document.getElementById('botCommandsModal').style.display = 'flex';
    loadBotCommands();
}

function closeBotCommandsModal() {
    document.getElementById('botCommandsModal').style.display = 'none';
    currentBotId = null;
}

function showCreateCommandModal() {
    currentCommandId = null;
    document.getElementById('commandModalTitle').textContent = 'Создать команду';
    document.getElementById('commandSubmitBtn').textContent = 'Создать команду';
    document.getElementById('deleteCommandBtn').style.display = 'none';
    
    // Clear form
    document.getElementById('commandForm').reset();
    document.getElementById('commandActive').classList.add('checked');
    
    // Reset command type
    selectCommandType('regular');
    loadParentMultiCommands();
    
    document.getElementById('commandModal').style.display = 'flex';
}

function showCreateMultiCommandModal() {
    currentCommandId = null;
    document.getElementById('commandModalTitle').textContent = 'Создать мульти-команду';
    document.getElementById('commandSubmitBtn').textContent = 'Создать мульти-команду';
    document.getElementById('deleteCommandBtn').style.display = 'none';
    
    // Clear form
    document.getElementById('commandForm').reset();
    document.getElementById('commandActive').classList.add('checked');
    
    // Set multi-command type
    selectCommandType('multi');
    
    // Set default JSON for multi-command
    document.getElementById('commandCode').value = JSON.stringify({
        "type": "multi_command",
        "description": "Группа команд для сложного взаимодействия",
        "welcome_message": "Добро пожаловать в мульти-команду!"
    }, null, 2);
    
    document.getElementById('commandModal').style.display = 'flex';
}

function selectCommandType(type) {
    const regularCheckbox = document.getElementById('commandTypeRegular');
    const multiCheckbox = document.getElementById('commandTypeMulti');
    const parentGroup = document.getElementById('parentCommandGroup');
    const externalGroup = document.getElementById('externalCommandsGroup');
    
    // Reset checkboxes
    regularCheckbox.classList.remove('checked');
    multiCheckbox.classList.remove('checked');
    
    if (type === 'regular') {
        regularCheckbox.classList.add('checked');
        parentGroup.style.display = 'block';
        externalGroup.style.display = 'none';
    } else if (type === 'multi') {
        multiCheckbox.classList.add('checked');
        parentGroup.style.display = 'none';
        externalGroup.style.display = 'block';
    }
}

async function loadParentMultiCommands() {
    if (!currentBotId) return;
    
    try {
        const response = await fetch(`/api/bots/${currentBotId}/commands`);
        const data = await response.json();
        
        if (data.success) {
            const multiCommands = data.commands.filter(cmd => cmd.is_multi_command);
            const select = document.getElementById('parentMultiCommand');
            
            select.innerHTML = '<option value="">Выберите мульти-команду</option>';
            multiCommands.forEach(cmd => {
                const option = document.createElement('option');
                option.value = cmd.id;
                option.textContent = cmd.name;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading parent multi commands:', error);
    }
}

function closeCommandModal() {
    document.getElementById('commandModal').style.display = 'none';
    currentCommandId = null;
}

async function loadBotCommands() {
    try {
        const response = await fetch(`/api/bots/${currentBotId}/commands`);
        const data = await response.json();
        
        // Check if response has success field and commands array
        if (data.success && data.commands) {
            botCommands = data.commands;
        } else if (Array.isArray(data)) {
            // Fallback for direct array response
            botCommands = data;
        } else {
            console.error('Invalid response format:', data);
            botCommands = [];
        }
        
        renderCommandsTable();
    } catch (error) {
        console.error('Failed to load bot commands:', error);
        navigation.showNotification('Ошибка загрузки команд', 'error');
        botCommands = [];
    }
}

function renderCommandsTable() {
    const tbody = document.querySelector('#commandsTable tbody');
    if (!tbody) return;

    // Check if botCommands is an array
    if (!Array.isArray(botCommands)) {
        console.error('botCommands is not an array:', botCommands);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-secondary);">Ошибка загрузки команд</td></tr>';
        return;
    }

    if (botCommands.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-secondary);">Команды не найдены</td></tr>';
        return;
    }

    tbody.innerHTML = botCommands.map(command => {
        const statusClass = command.is_active ? 'status-online' : 'status-offline';
        const statusText = command.is_active ? 'Активна' : 'Отключена';
        const createdDate = new Date(command.created_at).toLocaleDateString('ru-RU');
        
        // Determine command type and styling
        let typeInfo = { text: 'Обычная', color: 'var(--primary-green)', icon: '⚡' };
        let commandPrefix = '/';
        
        if (command.is_multi_command) {
            typeInfo = { text: 'Мульти', color: 'var(--primary-blue)', icon: '📦' };
        } else if (command.parent_multi_command_id) {
            typeInfo = { text: 'Вложенная', color: 'var(--warning-yellow)', icon: '🔗' };
            commandPrefix = '  ↳ /';
        }

        return `
            <tr>
                <td>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 32px; height: 32px; background: ${typeInfo.color}; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 12px;">
                            ${typeInfo.icon}
                        </div>
                        <div>
                            <div style="font-weight: 600; color: var(--text-primary);">${commandPrefix}${command.name}</div>
                            <div style="font-size: 12px; color: var(--text-secondary);">Команда</div>
                        </div>
                    </div>
                </td>
                <td>
                    <span style="display: inline-block; padding: 2px 8px; background: ${typeInfo.color}20; color: ${typeInfo.color}; border-radius: 12px; font-size: 12px; font-weight: 500; margin-bottom: 4px;">
                        ${typeInfo.text}
                    </span>
                </td>
                <td>${command.description}</td>
                <td class="hidden-mobile"><span class="${statusClass}">${statusText}</span></td>
                <td class="hidden-tablet">${createdDate}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-small btn-secondary" onclick="editCommand(${command.id})">
                            Редактировать
                        </button>
                        ${command.is_multi_command ? `
                            <button class="btn btn-small btn-warning" onclick="clearMultiCommandContext(${command.id})" title="Выйти из мульти-команды">
                                🚪
                            </button>
                        ` : ''}
                        <button class="btn btn-small btn-danger" onclick="quickDeleteCommand(${command.id}, '${command.name.replace(/'/g, "\\'")}' )" title="Удалить команду">
                            🗑️
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function editCommand(commandId) {
    try {
        console.log('editCommand called with ID:', commandId, 'type:', typeof commandId);
        console.log('botCommands array:', botCommands);
        console.log('currentBotId:', currentBotId);
        
        if (!botCommands || botCommands.length === 0) {
            console.error('No commands loaded');
            navigation.showNotification('Команды не загружены', 'error');
            return;
        }
        
        console.log('Available commands:', botCommands.map(cmd => ({ id: cmd.id, type: typeof cmd.id, name: cmd.name })));
        
        // Convert both to same type for comparison
        const command = botCommands.find(cmd => String(cmd.id) === String(commandId));
        if (!command) {
            console.error('Command not found with ID:', commandId);
            navigation.showNotification('Команда не найдена', 'error');
            return;
        }
        
        console.log('Found command:', command);

        currentCommandId = commandId;
        
        // Fill form
        document.getElementById('commandName').value = command.name;
        document.getElementById('commandDescription').value = command.description;
        document.getElementById('commandCode').value = JSON.stringify(JSON.parse(command.json_code), null, 2);
        
        // Set active checkbox
        const activeCheckbox = document.getElementById('commandActive');
        if (command.is_active) {
            activeCheckbox.classList.add('checked');
        } else {
            activeCheckbox.classList.remove('checked');
        }
        
        // Set command type
        if (command.is_multi_command) {
            selectCommandType('multi');
        } else {
            selectCommandType('regular');
        }
        
        // Load parent multi commands and set value
        await loadParentMultiCommands();
        if (command.parent_multi_command_id) {
            document.getElementById('parentMultiCommand').value = command.parent_multi_command_id;
        }
        
        // Set external commands checkbox
        const externalCheckbox = document.getElementById('allowExternalCommands');
        if (command.allow_external_commands) {
            externalCheckbox.classList.add('checked');
        } else {
            externalCheckbox.classList.remove('checked');
        }
        
        // Update modal
        console.log('Updating modal elements...');
        const modalTitle = document.getElementById('commandModalTitle');
        const submitBtn = document.getElementById('commandSubmitBtn');
        const deleteBtn = document.getElementById('deleteCommandBtn');
        const modal = document.getElementById('commandModal');
        
        console.log('Modal elements found:', { modalTitle, submitBtn, deleteBtn, modal });
        
        if (modalTitle) modalTitle.textContent = 'Редактировать команду';
        if (submitBtn) submitBtn.textContent = 'Сохранить изменения';
        if (deleteBtn) deleteBtn.style.display = 'inline-flex';
        
        if (modal) {
            console.log('Opening modal...');
            modal.style.display = 'flex';
        } else {
            console.error('Modal element not found!');
        }
    } catch (error) {
        console.error('Failed to edit command:', error);
        navigation.showNotification('Ошибка редактирования команды', 'error');
    }
}

async function handleCommandSubmit(event) {
    event.preventDefault();
    
    const name = document.getElementById('commandName').value;
    const description = document.getElementById('commandDescription').value;
    const jsonCode = document.getElementById('commandCode').value;
    const isActive = document.getElementById('commandActive').classList.contains('checked');
    
    // Determine command type
    const isMultiCommand = document.getElementById('commandTypeMulti').classList.contains('checked');
    const parentMultiCommandId = document.getElementById('parentMultiCommand').value || null;
    const allowExternalCommands = document.getElementById('allowExternalCommands').classList.contains('checked');
    
    // Validate JSON
    try {
        JSON.parse(jsonCode);
    } catch (error) {
        navigation.showNotification('Неверный JSON формат', 'error');
        return;
    }
    
    const commandData = {
        name,
        description,
        json_code: jsonCode,
        is_active: isActive,
        is_multi_command: isMultiCommand,
        parent_multi_command_id: parentMultiCommandId,
        allow_external_commands: allowExternalCommands
    };
    
    try {
        const url = currentCommandId 
            ? `/api/bots/${currentBotId}/commands/${currentCommandId}`
            : `/api/bots/${currentBotId}/commands`;
        
        const method = currentCommandId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(commandData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            navigation.showNotification(
                currentCommandId ? 'Команда обновлена!' : 'Команда создана!', 
                'success'
            );
            closeCommandModal();
            loadBotCommands();
        } else {
            navigation.showNotification(data.message || 'Ошибка сохранения команды', 'error');
        }
    } catch (error) {
        console.error('Command save error:', error);
        navigation.showNotification('Ошибка сохранения команды', 'error');
    }
}

async function deleteCommand() {
    if (!currentCommandId) return;
    
    if (!confirm('Вы уверены, что хотите удалить эту команду?')) return;
    
    try {
        const response = await fetch(`/api/bots/${currentBotId}/commands/${currentCommandId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            navigation.showNotification('Команда удалена!', 'success');
            closeCommandModal();
            loadBotCommands();
        } else {
            navigation.showNotification('Ошибка удаления команды', 'error');
        }
    } catch (error) {
        console.error('Command delete error:', error);
        navigation.showNotification('Ошибка удаления команды', 'error');
    }
}

// Quick delete command function for table button
async function quickDeleteCommand(commandId, commandName) {
    if (!confirm(`Вы уверены, что хотите удалить команду "${commandName}"?`)) return;
    
    try {
        const response = await fetch(`/api/bots/${currentBotId}/commands/${commandId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            navigation.showNotification(`Команда "${commandName}" удалена!`, 'success');
            loadBotCommands();
        } else {
            navigation.showNotification('Ошибка удаления команды', 'error');
        }
    } catch (error) {
        console.error('Quick delete command error:', error);
        navigation.showNotification('Ошибка удаления команды', 'error');
    }
}

async function clearMultiCommandContext(commandId) {
    if (!confirm('Очистить контекст мульти-команды для всех чатов?')) return;
    
    try {
        const response = await fetch(`/api/bots/${currentBotId}/multi-command-context/${commandId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            navigation.showNotification('🧹 Контекст мульти-команды очищен!', 'success');
        } else {
            navigation.showNotification(data.message || 'Ошибка очистки контекста', 'error');
        }
    } catch (error) {
        console.error('Clear context error:', error);
        navigation.showNotification('Ошибка очистки контекста', 'error');
    }
}

function toggleMemorySettings(checkbox) {
    console.log('toggleMemorySettings called', checkbox);
    console.log('Checkbox ID:', checkbox.id);
    console.log('Checkbox classes before toggle:', checkbox.className);
    console.log('Checkbox state before toggle:', checkbox.classList.contains('checked'));
    
    // Prevent event bubbling
    event.stopPropagation();
    event.preventDefault();
    
    // Toggle checkbox state
    checkbox.classList.toggle('checked');
    
    const isChecked = checkbox.classList.contains('checked');
    console.log('Checkbox classes after toggle:', checkbox.className);
    console.log('Checkbox state after toggle:', isChecked);
    
    // Show/hide memory count group
    const memoryCountGroup = document.getElementById('memoryCountGroup');
    console.log('Memory count group found:', memoryCountGroup);
    
    if (memoryCountGroup) {
        if (isChecked) {
            memoryCountGroup.style.opacity = '1';
            memoryCountGroup.style.pointerEvents = 'auto';
            console.log('Memory enabled - showing count input');
        } else {
            memoryCountGroup.style.opacity = '0.5';
            memoryCountGroup.style.pointerEvents = 'none';
            console.log('Memory disabled - hiding count input');
        }
    }
    
    // Double check after a small delay
    setTimeout(() => {
        const finalState = checkbox.classList.contains('checked');
        console.log('Final checkbox state after 100ms:', finalState);
        console.log('Final checkbox classes after 100ms:', checkbox.className);
    }, 100);
}

function toggleExternalCommands(checkbox) {
    console.log('toggleExternalCommands called', checkbox);
    console.log('Checkbox ID:', checkbox.id);
    console.log('Checkbox classes before toggle:', checkbox.className);
    console.log('Checkbox state before toggle:', checkbox.classList.contains('checked'));
    
    // Prevent event bubbling
    event.stopPropagation();
    event.preventDefault();
    
    // Toggle checkbox state
    checkbox.classList.toggle('checked');
    
    const isChecked = checkbox.classList.contains('checked');
    console.log('Checkbox classes after toggle:', checkbox.className);
    console.log('Checkbox state after toggle:', isChecked);
    
    // Double check after a small delay
    setTimeout(() => {
        const finalState = checkbox.classList.contains('checked');
        console.log('Final external commands checkbox state after 100ms:', finalState);
        console.log('Final external commands checkbox classes after 100ms:', checkbox.className);
    }, 100);
}

function toggleCommandActive(checkbox) {
    console.log('toggleCommandActive called', checkbox);
    console.log('Checkbox ID:', checkbox.id);
    console.log('Checkbox classes before toggle:', checkbox.className);
    console.log('Checkbox state before toggle:', checkbox.classList.contains('checked'));
    
    // Prevent event bubbling
    event.stopPropagation();
    event.preventDefault();
    
    // Toggle checkbox state
    checkbox.classList.toggle('checked');
    
    const isChecked = checkbox.classList.contains('checked');
    console.log('Checkbox classes after toggle:', checkbox.className);
    console.log('Checkbox state after toggle:', isChecked);
    
    // Double check after a small delay
    setTimeout(() => {
        const finalState = checkbox.classList.contains('checked');
        console.log('Final command active checkbox state after 100ms:', finalState);
        console.log('Final command active checkbox classes after 100ms:', checkbox.className);
    }, 100);
}



// Add CSS animation for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Create global navigation instance
    navigation = new PageNavigation();
    
    // Create global notification system instance
    notificationSystem = new NotificationSystem();
    notificationSystem.init();
    
    // Create mobile menu system
    const mobileMenu = new MobileMenu();
window.mobileMenu = mobileMenu;

// Handle window resize for responsive bot display
window.addEventListener('resize', debounce(() => {
    if (navigation.currentPage === 'bots') {
        navigation.renderBotsTable();
    }
}, 250));
    
    // Setup additional handlers after DOM is ready
    setTimeout(() => {
        // Setup debug filter listeners
        const logLevel = document.getElementById('logLevel');
        const logCategory = document.getElementById('logCategory');
        
        if (logLevel) {
            logLevel.addEventListener('change', refreshLogs);
        }
        if (logCategory) {
            logCategory.addEventListener('change', refreshLogs);
        }
        
        // Start auto-refresh for debug page
        startDebugAutoRefresh();
        
        // Setup database form handler
        const databaseForm = document.getElementById('databaseForm');
        if (databaseForm) {
            databaseForm.addEventListener('submit', handleDatabaseSubmit);
        }
        
        // Setup command form handler
        const commandForm = document.getElementById('commandForm');
        if (commandForm) {
            commandForm.addEventListener('submit', handleCommandSubmit);
        }
        
        // Close modal on background click
        const databaseModal = document.getElementById('databaseModal');
        if (databaseModal) {
            databaseModal.addEventListener('click', (e) => {
                if (e.target === databaseModal) {
                    closeDatabaseModal();
                }
            });
        }
        
        // Close command modal on background click
        const commandModal = document.getElementById('commandModal');
        if (commandModal) {
            commandModal.addEventListener('click', (e) => {
                if (e.target === commandModal) {
                    closeCommandModal();
                }
            });
        }
        
        // Close bot commands modal on background click
        const botCommandsModal = document.getElementById('botCommandsModal');
        if (botCommandsModal) {
            botCommandsModal.addEventListener('click', (e) => {
                if (e.target === botCommandsModal) {
                    closeBotCommandsModal();
                }
            });
        }
        
        console.log('All event handlers initialized successfully');
    }, 500);
    
    console.log('Application initialized successfully');
    
    // Initialize login page animations
    initializeLoginAnimations();
}); 

// Login page animations
function initializeLoginAnimations() {
    createFloatingSymbols();
    startTypingAnimation();
}

function createFloatingSymbols() {
    const container = document.getElementById('floatingSymbols');
    if (!container) return;
    
    const symbols = [
        '🤖', '{', '}', '<', '>', '/', '*', '+', '=', '-', 
        '(', ')', '[', ']', ';', ':', '.', ',', '"', "'",
        '#', '@', '&', '%', '$', '!', '?', '~', '^', '_',
        '0', '1', 'A', 'Z', 'α', 'β', '∞', '∆', '≈', '≠'
    ];
    
    function createSymbol() {
        const symbol = document.createElement('div');
        symbol.className = 'symbol';
        symbol.textContent = symbols[Math.floor(Math.random() * symbols.length)];
        
        // Random position
        symbol.style.left = Math.random() * 100 + '%';
        symbol.style.fontSize = (Math.random() * 15 + 10) + 'px';
        
        // Random delay
        symbol.style.animationDelay = Math.random() * 5 + 's';
        
        container.appendChild(symbol);
        
        // Remove after animation
        setTimeout(() => {
            if (symbol.parentNode) {
                symbol.parentNode.removeChild(symbol);
            }
        }, 25000);
    }
    
    // Create initial symbols
    for (let i = 0; i < 30; i++) {
        setTimeout(() => createSymbol(), i * 200);
    }
    
    // Continuously create new symbols
    setInterval(createSymbol, 800);
}

function startTypingAnimation() {
    const textElement = document.getElementById('typingText');
    if (!textElement) return;
    
    const phrases = [
        'Добро пожаловать в админ панель...',
        'Управление Telegram ботами...',
        'Искусственный интеллект готов...',
        'Система безопасности активна...',
        'Подключение к серверам...',
        'Инициализация завершена.'
    ];
    
    let currentPhrase = 0;
    let currentChar = 0;
    let isDeleting = false;
    
    function typeText() {
        const text = phrases[currentPhrase];
        
        if (isDeleting) {
            textElement.textContent = text.substring(0, currentChar - 1);
            currentChar--;
        } else {
            textElement.textContent = text.substring(0, currentChar + 1);
            currentChar++;
        }
        
        let typeSpeed = isDeleting ? 50 : 100;
        
        if (!isDeleting && currentChar === text.length) {
            typeSpeed = 2000; // Pause at end
            isDeleting = true;
        } else if (isDeleting && currentChar === 0) {
            isDeleting = false;
            currentPhrase = (currentPhrase + 1) % phrases.length;
            typeSpeed = 500; // Pause before next phrase
        }
        
        setTimeout(typeText, typeSpeed);
    }
    
    typeText();
}