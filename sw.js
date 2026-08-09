// =============================================
// SERVICE WORKER - Handles Push Notifications
// =============================================

const CACHE_NAME = 'sanjose-email-cache-v2';

// Files to cache
const urlsToCache = [
    '/',
    '/index.html',
    '/manifest.json'
];

// Install event - cache files
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
        ]).then(() => {
            console.log('Service worker activated, scheduling notifications');
            // Start scheduling after activation
            setTimeout(() => {
                scheduleNextNotification();
            }, 3000);
        })
    );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                return response || fetch(event.request);
            })
    );
});

// =============================================
// NOTIFICATION STATE
// =============================================

// Store user preferences
let userPreferences = {
    district: '1',
    email: '',
    name: '',
    frequency: 'daily' // daily, weekly, monthly
};

// Track if we've already sent a notification today
let lastNotificationDate = null;

// =============================================
// HANDLE MESSAGES FROM THE PAGE
// =============================================

self.addEventListener('message', (event) => {
    const data = event.data;
    console.log('Message received:', data);
    
    if (data.type === 'init') {
        userPreferences.district = data.district || '1';
        userPreferences.frequency = data.frequency || 'daily';
        console.log('Service worker initialized with:', userPreferences);
    }
    
    if (data.type === 'schedule') {
        userPreferences.district = data.district || '1';
        userPreferences.email = data.email || '';
        userPreferences.name = data.name || '';
        userPreferences.frequency = data.frequency || 'daily';
        
        console.log('Notification scheduled with frequency:', userPreferences.frequency);
        
        // Send a test notification
        sendTestNotification();
        
        // Reschedule
        scheduleNextNotification();
    }
    
    if (data.type === 'update_schedule') {
        userPreferences.district = data.district || '1';
        userPreferences.email = data.email || '';
        userPreferences.name = data.name || '';
        userPreferences.frequency = data.frequency || 'daily';
        
        console.log('Schedule updated to:', userPreferences.frequency);
        
        // Clear existing schedule and reschedule
        if (self.scheduledTimeout) {
            clearTimeout(self.scheduledTimeout);
            self.scheduledTimeout = null;
        }
        scheduleNextNotification();
        
        // Notify the page
        self.clients.matchAll().then((clients) => {
            clients.forEach((client) => {
                client.postMessage({
                    type: 'schedule_updated',
                    frequency: userPreferences.frequency
                });
            });
        });
    }
});

// =============================================
// SEND NOTIFICATIONS
// =============================================

// Send a test notification
function sendTestNotification() {
    const freqLabels = {
        'daily': 'daily',
        'weekly': 'weekly',
        'monthly': 'monthly'
    };
    const freqText = freqLabels[userPreferences.frequency] || 'daily';
    
    const options = {
        body: `✅ Daily reminders are set! You will receive a notification ${freqText} at 9:00 AM.`,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📧</text></svg>',
        badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📧</text></svg>',
        vibrate: [200, 100, 200],
        requireInteraction: true,
        data: {
            type: 'test',
            url: '/?action=send'
        },
        actions: [
            {
                action: 'open',
                title: '📧 Send Email Now'
            },
            {
                action: 'dismiss',
                title: 'Dismiss'
            }
        ]
    };

    self.registration.showNotification('📧 Reminders Enabled', options)
        .then(() => {
            console.log('Test notification sent');
        })
        .catch((error) => {
            console.error('Error sending test notification:', error);
        });
}

// Send the scheduled notification
function sendScheduledNotification() {
    const district = userPreferences.district || '1';
    const name = userPreferences.name || 'Your Councilmember';
    const freqLabels = {
        'daily': 'daily',
        'weekly': 'weekly',
        'monthly': 'monthly'
    };
    const freqText = freqLabels[userPreferences.frequency] || 'daily';
    
    const options = {
        body: `Time to email ${name} in District ${district}! Tap to send now. (${freqText} reminder)`,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📧</text></svg>',
        badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📧</text></svg>',
        vibrate: [200, 100, 200, 100, 200],
        requireInteraction: true,
        data: {
            type: 'daily',
            url: '/?action=send',
            district: district
        },
        actions: [
            {
                action: 'open',
                title: '📧 Send Email Now'
            },
            {
                action: 'snooze',
                title: '⏰ Remind in 1 Hour'
            },
            {
                action: 'dismiss',
                title: 'Dismiss'
            }
        ],
        tag: 'reminder-' + new Date().toDateString(),
        renotify: true
    };

    const title = `📧 Email Your Councilmember - District ${district}`;
    
    self.registration.showNotification(title, options)
        .then(() => {
            console.log('Scheduled notification sent');
            lastNotificationDate = new Date().toDateString();
            
            // Notify the page
            self.clients.matchAll().then((clients) => {
                clients.forEach((client) => {
                    client.postMessage({
                        type: 'notification_sent',
                        timestamp: new Date().toISOString()
                    });
                });
            });
        })
        .catch((error) => {
            console.error('Error sending scheduled notification:', error);
        });
}

// =============================================
// SCHEDULE NOTIFICATIONS
// =============================================

// Get milliseconds until next scheduled time based on frequency
function getTimeUntilNextNotification() {
    const now = new Date();
    let target = new Date(now);
    target.setHours(9, 0, 0, 0);
    
    // If it's past 9:00 AM today, schedule for the next appropriate day
    if (now >= target) {
        const frequency = userPreferences.frequency || 'daily';
        
        if (frequency === 'daily') {
            target.setDate(target.getDate() + 1);
        } else if (frequency === 'weekly') {
            target.setDate(target.getDate() + 7);
        } else if (frequency === 'monthly') {
            target.setMonth(target.getMonth() + 1);
        }
    }
    
    const delay = target.getTime() - now.getTime();
    console.log(`Next ${userPreferences.frequency} notification in ${Math.round(delay / 60000)} minutes at ${target}`);
    return delay;
}

// Schedule the next notification
function scheduleNextNotification() {
    // Clear any existing timeout
    if (self.scheduledTimeout) {
        clearTimeout(self.scheduledTimeout);
        self.scheduledTimeout = null;
    }
    
    const delay = getTimeUntilNextNotification();
    
    // Don't schedule if delay is too long (safety)
    if (delay > 0) {
        self.scheduledTimeout = setTimeout(() => {
            // Send the notification
            sendScheduledNotification();
            
            // Schedule the next one based on frequency
            scheduleNextNotification();
        }, delay);
        
        console.log(`Next ${userPreferences.frequency} notification scheduled in ${Math.round(delay / 60000)} minutes`);
    } else {
        console.warn('Invalid delay, rescheduling in 1 minute');
        self.scheduledTimeout = setTimeout(scheduleNextNotification, 60000);
    }
}

// =============================================
// HANDLE NOTIFICATION CLICKS
// =============================================

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const action = event.action;
    const data = event.notification.data;
    const url = data?.url || '/?action=send';

    console.log('Notification clicked:', action, data);

    if (action === 'open' || !action) {
        // Open the app
        event.waitUntil(
            self.clients.matchAll({
                type: 'window',
                includeUncontrolled: true
            }).then((clientList) => {
                for (const client of clientList) {
                    if (client.url.includes('index.html') && 'focus' in client) {
                        return client.focus();
                    }
                }
                if (self.clients.openWindow) {
                    return self.clients.openWindow(url);
                }
            })
        );
    } else if (action === 'snooze') {
        // Snooze - remind in 1 hour
        event.waitUntil(
            new Promise((resolve) => {
                setTimeout(() => {
                    sendScheduledNotification();
                    resolve();
                }, 3600000); // 1 hour
            })
        );
    } else if (action === 'dismiss') {
        console.log('Notification dismissed');
    }
});

// =============================================
// HANDLE PUSH EVENTS (for future use)
// =============================================

self.addEventListener('push', (event) => {
    console.log('Push event received:', event);
    
    let notificationData = {
        title: '📧 Email Your Councilmember',
        options: {
            body: `Don't forget to email your council member today!`,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📧</text></svg>',
            badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📧</text></svg>',
            requireInteraction: true,
            data: {
                type: 'push',
                url: '/?action=send'
            },
            actions: [
                {
                    action: 'open',
                    title: '📧 Send Email Now'
                }
            ]
        }
    };

    if (event.data) {
        try {
            const data = event.data.json();
            if (data.title) notificationData.title = data.title;
            if (data.body) notificationData.options.body = data.body;
        } catch (e) {
            // If data is plain text
            notificationData.options.body = event.data.text() || notificationData.options.body;
        }
    }

    event.waitUntil(
        self.registration.showNotification(notificationData.title, notificationData.options)
    );
});

// =============================================
// BACKGROUND SYNC (for when offline)
// =============================================

self.addEventListener('sync', (event) => {
    if (event.tag === 'daily-reminder') {
        event.waitUntil(
            sendScheduledNotification()
        );
    }
});

console.log('📧 Service Worker loaded with frequency support');