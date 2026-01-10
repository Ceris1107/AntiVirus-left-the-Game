// auth.js - Система аутентификации для проекта AntiVirus yet Invented

const SUPABASE_URL = 'https://jbqjzfnmmkccryxzuald.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpicWp6Zm5tbWtjY3J5eHp1YWxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1NTA0OTUsImV4cCI6MjA3OTEyNjQ5NX0.C_oIRLLtJ_ZSrjfRLzwjn1-bdFhunX9Rn1ATU_2FwuQ';

// Инициализация Supabase клиента
const supabaseClient = {
    from: (table) => ({
        select: (columns) => ({
            eq: (column, value) => {
                return fetch(`${SUPABASE_URL}/rest/v1/${table}?${column}=eq.${encodeURIComponent(value)}&select=${columns}`, {
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json'
                    }
                })
                .then(res => res.json());
            },
            insert: (data) => {
                return fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
                    method: 'POST',
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify(data)
                })
                .then(async res => {
                    if (res.ok) {
                        const result = await res.json();
                        return { data: result, error: null };
                    } else {
                        const error = await res.json();
                        return { data: null, error: error };
                    }
                });
            }
        })
    })
};

// Сессионное хранилище
class AuthSession {
    static SESSION_KEY = 'avi_user_session';
    
    static setSession(userData) {
        const sessionData = {
            id: userData.id,
            nickname: userData.nickname,
            timestamp: Date.now(),
            best_times: userData.best_times || {}
        };
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(sessionData));
        return sessionData;
    }
    
    static getSession() {
        const sessionStr = localStorage.getItem(this.SESSION_KEY);
        if (!sessionStr) return null;
        
        try {
            const sessionData = JSON.parse(sessionStr);
            // Проверяем, не истекла ли сессия (24 часа)
            const sessionAge = Date.now() - sessionData.timestamp;
            const maxAge = 24 * 60 * 60 * 1000; // 24 часа в миллисекундах
            if (sessionAge > maxAge) {
                this.clearSession();
                return null;
            }
            return sessionData;
        } catch (error) {
            this.clearSession();
            return null;
        }
    }
    
    static clearSession() {
        localStorage.removeItem(this.SESSION_KEY);
    }
    
    static updateBestTimes(level, time) {
        const session = this.getSession();
        if (!session) return null;
        
        session.best_times = session.best_times || {};
        session.best_times[level.toString()] = time;
        session.timestamp = Date.now();
        
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
        return session;
    }
}

// Основные функции аутентификации
class AuthService {
    static async login(nickname, password) {
        try {
            // Ищем пользователя с таким никнеймом
            const users = await supabaseClient
                .from('users')
                .select('id, nickname, password, best_times, created_at')
                .eq('nickname', nickname);
            
            if (!users || users.length === 0) {
                return {
                    success: false,
                    error: 'Пользователь с таким никнеймом не найден'
                };
            }
            
            const user = users[0];
            
            // В реальном приложении здесь должно быть хэширование пароля
            // Для учебного проекта сравниваем пароли напрямую
            if (user.password !== password) {
                return {
                    success: false,
                    error: 'Неверный пароль'
                };
            }
            
            // Создаем сессию
            const sessionData = AuthSession.setSession(user);
            
            return {
                success: true,
                user: sessionData
            };
            
        } catch (error) {
            console.error('Login error:', error);
            return {
                success: false,
                error: 'Ошибка сервера. Попробуйте позже.'
            };
        }
    }
    
    static async register(nickname, password) {
        try {
            // Проверяем, существует ли уже пользователь с таким никнеймом
            const existingUsers = await supabaseClient
                .from('users')
                .select('id')
                .eq('nickname', nickname);
            
            if (existingUsers && existingUsers.length > 0) {
                return {
                    success: false,
                    error: 'Никнейм уже занят'
                };
            }
            
            // Создаем нового пользователя
            const newUser = {
                nickname: nickname,
                password: password, // В реальном приложении нужно хэшировать!
                best_times: {},
                created_at: new Date().toISOString()
            };
            
            const result = await supabaseClient
                .from('users')
                .select('*')
                .insert(newUser);
            
            if (result.error) {
                return {
                    success: false,
                    error: 'Ошибка при создании пользователя: ' + result.error.message
                };
            }
            
            const user = result.data[0];
            
            // Создаем сессию
            const sessionData = AuthSession.setSession(user);
            
            return {
                success: true,
                user: sessionData
            };
            
        } catch (error) {
            console.error('Register error:', error);
            return {
                success: false,
                error: 'Ошибка сервера. Попробуйте позже.'
            };
        }
    }
    
    static logout() {
        AuthSession.clearSession();
        return true;
    }
    
    static checkAuth() {
        return AuthSession.getSession();
    }
    
    static async updateBestTime(level, time) {
        const session = AuthSession.getSession();
        if (!session) return null;
        
        try {
            // Обновляем в базе данных
            const response = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${session.id}`, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({
                    best_times: {
                        ...session.best_times,
                        [level.toString()]: time
                    }
                })
            });
            
            if (response.ok) {
                // Обновляем локальную сессию
                return AuthSession.updateBestTimes(level, time);
            }
        } catch (error) {
            console.error('Update best time error:', error);
        }
        
        return null;
    }
    
    static async syncBestTimes() {
        const session = AuthSession.getSession();
        if (!session) return null;
        
        try {
            const users = await supabaseClient
                .from('users')
                .select('best_times')
                .eq('id', session.id);
            
            if (users && users.length > 0) {
                const user = users[0];
                session.best_times = user.best_times || {};
                session.timestamp = Date.now();
                localStorage.setItem(AuthSession.SESSION_KEY, JSON.stringify(session));
                return session;
            }
        } catch (error) {
            console.error('Sync best times error:', error);
        }
        
        return null;
    }
}

// Функции для работы с UI
class AuthUI {
    static showNotification(message, type = 'error') {
        // Удаляем старые уведомления
        const oldNotifications = document.querySelectorAll('.auth-notification');
        oldNotifications.forEach(n => n.remove());
        
        // Создаем новое уведомление
        const notification = document.createElement('div');
        notification.className = `auth-notification auth-notification-${type}`;
        notification.innerHTML = `
            <div class="auth-notification-content">
                <span class="auth-notification-icon">${type === 'success' ? '✓' : '✗'}</span>
                <span class="auth-notification-text">${message}</span>
            </div>
        `;
        
        // Добавляем стили
        const style = document.createElement('style');
        style.textContent = `
            .auth-notification {
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: ${type === 'success' ? 'rgba(39, 174, 96, 0.9)' : 'rgba(231, 76, 60, 0.9)'};
                color: white;
                padding: 15px 25px;
                border-radius: 10px;
                box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
                z-index: 1000000;
                animation: authNotificationSlideIn 0.3s ease;
                backdrop-filter: blur(10px);
                border: 1px solid ${type === 'success' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.2)'};
                min-width: 300px;
                max-width: 90vw;
                text-align: center;
            }
            
            .auth-notification-success {
                background: rgba(39, 174, 96, 0.9);
            }
            
            .auth-notification-error {
                background: rgba(231, 76, 60, 0.9);
            }
            
            .auth-notification-content {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                font-size: 14px;
                font-weight: 500;
            }
            
            .auth-notification-icon {
                font-size: 18px;
                font-weight: bold;
            }
            
            @keyframes authNotificationSlideIn {
                from {
                    opacity: 0;
                    transform: translateX(-50%) translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }
            }
            
            @keyframes authNotificationSlideOut {
                from {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }
                to {
                    opacity: 0;
                    transform: translateX(-50%) translateY(-20px);
                }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(notification);
        
        // Автоматическое скрытие через 5 секунд
        setTimeout(() => {
            notification.style.animation = 'authNotificationSlideOut 0.3s ease forwards';
            setTimeout(() => {
                notification.remove();
                style.remove();
            }, 300);
        }, 5000);
        
        return notification;
    }
    
    static createUserIndicator(nickname) {
        const indicator = document.createElement('div');
        indicator.id = 'user-indicator';
        indicator.innerHTML = `
            <div class="user-indicator-content">
                <i class="fas fa-user"></i>
                <span class="user-nickname">${nickname}</span>
            </div>
        `;
        
        const style = document.createElement('style');
        style.textContent = `
            #user-indicator {
                position: absolute;
                top: 10px;
                left: 20px;
                z-index: 1000000;
                background: rgba(50, 50, 50, 0.7);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                padding: 8px 15px;
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                font-family: sans-serif;
                font-size: 14px;
                color: white;
                display: flex;
                align-items: center;
                gap: 8px;
                min-width: 150px;
                box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
                user-select: none;
                pointer-events: none;
            }
            
            .user-indicator-content {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            #user-indicator i {
                color: #a8e063;
                font-size: 16px;
            }
            
            .user-nickname {
                font-weight: 500;
                letter-spacing: 0.5px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                max-width: 120px;
            }
            
            @media (max-width: 768px) {
                #user-indicator {
                    top: 5px;
                    left: 5px;
                    padding: 6px 10px;
                    font-size: 12px;
                    min-width: 120px;
                }
                
                .user-nickname {
                    max-width: 80px;
                }
            }
        `;
        document.head.appendChild(style);
        
        return indicator;
    }
}

// Экспорт для использования в других файлах
window.AuthService = AuthService;
window.AuthSession = AuthSession;
window.AuthUI = AuthUI;

console.log('Auth module loaded successfully');