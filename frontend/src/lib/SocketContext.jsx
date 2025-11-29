import { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext();

export const useSocket = () => {
    return useContext(SocketContext);
};

export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const { isAuthenticated, user } = useAuth();

    useEffect(() => {
        if (isAuthenticated && user) {
            // Connect to the backend URL. Adjust if your backend URL is different in dev/prod.
            // Assuming backend is on localhost:5000 or same host in prod
            const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';

            const newSocket = io(backendUrl, {
                withCredentials: true,
                transports: ['websocket', 'polling'],
            });

            setSocket(newSocket);

            newSocket.on('connect', () => {
                console.log('Socket connected:', newSocket.id);
                if (user?.email) {
                    newSocket.emit('register_user', user.email);
                }
            });

            return () => {
                newSocket.disconnect();
            };
        } else {
            if (socket) {
                socket.disconnect();
                setSocket(null);
            }
        }
    }, [isAuthenticated, user]);

    return (
        <SocketContext.Provider value={socket}>
            {children}
        </SocketContext.Provider>
    );
};
