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
            best_times: userData.best_times || {},
            created_at: userData.created_at || new Date().toISOString()
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
    
    static updateSession(data) {
        const session = this.getSession();
        if (!session) return null;
        
        const updatedSession = {
            ...session,
            ...data,
            timestamp: Date.now()
        };
        
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(updatedSession));
        return updatedSession;
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
    
    static async updateNickname(newNickname) {
        const session = AuthSession.getSession();
        if (!session) {
            return {
                success: false,
                error: 'Сессия не найдена'
            };
        }
        
        try {
            // Проверяем, существует ли уже пользователь с таким никнеймом
            const existingUsers = await supabaseClient
                .from('users')
                .select('id')
                .eq('nickname', newNickname);
            
            if (existingUsers && existingUsers.length > 0) {
                return {
                    success: false,
                    error: 'Этот никнейм уже занят'
                };
            }
            
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
                    nickname: newNickname
                })
            });
            
            if (response.ok) {
                // Обновляем локальную сессию
                const updatedSession = AuthSession.updateSession({
                    nickname: newNickname
                });
                
                return {
                    success: true,
                    user: updatedSession
                };
            } else {
                const error = await response.json();
                return {
                    success: false,
                    error: 'Ошибка при обновлении никнейма: ' + (error.message || 'Неизвестная ошибка')
                };
            }
        } catch (error) {
            console.error('Update nickname error:', error);
            return {
                success: false,
                error: 'Ошибка сервера. Попробуйте позже.'
            };
        }
    }
    
    static async updatePassword(newPassword) {
        const session = AuthSession.getSession();
        if (!session) {
            return {
                success: false,
                error: 'Сессия не найдена'
            };
        }
        
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
                    password: newPassword
                })
            });
            
            if (response.ok) {
                return {
                    success: true
                };
            } else {
                const error = await response.json();
                return {
                    success: false,
                    error: 'Ошибка при обновлении пароля: ' + (error.message || 'Неизвестная ошибка')
                };
            }
        } catch (error) {
            console.error('Update password error:', error);
            return {
                success: false,
                error: 'Ошибка сервера. Попробуйте позже.'
            };
        }
    }
    
    static async deleteAccount() {
        const session = AuthSession.getSession();
        if (!session) {
            return {
                success: false,
                error: 'Сессия не найдена'
            };
        }
        
        try {
            // Удаляем пользователя из базы данных
            const response = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${session.id}`, {
                method: 'DELETE',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                // Очищаем локальную сессию
                AuthSession.clearSession();
                
                return {
                    success: true
                };
            } else {
                const error = await response.json();
                return {
                    success: false,
                    error: 'Ошибка при удалении аккаунта: ' + (error.message || 'Неизвестная ошибка')
                };
            }
        } catch (error) {
            console.error('Delete account error:', error);
            return {
                success: false,
                error: 'Ошибка сервера. Попробуйте позже.'
            };
        }
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
                .select('best_times, created_at')
                .eq('id', session.id);
            
            if (users && users.length > 0) {
                const user = users[0];
                const updatedSession = AuthSession.updateSession({
                    best_times: user.best_times || {},
                    created_at: user.created_at || session.created_at
                });
                return updatedSession;
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
}

// Экспорт для использования в других файлах
window.AuthService = AuthService;
window.AuthSession = AuthSession;
window.AuthUI = AuthUI;

console.log('Auth module loaded successfully');