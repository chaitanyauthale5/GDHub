import { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export const useSocket = () => {
    return useContext(SocketContext);
};

export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const { user } = useAuth();

    useEffect(() => {
        // Always connect; register user if available
        const backendUrl = (typeof globalThis !== 'undefined' && globalThis['__API_BASE_URL__'])
            ? globalThis['__API_BASE_URL__']
            : 'http://localhost:5000';
        const newSocket = io(backendUrl, {
            withCredentials: true,
            transports: ['websocket', 'polling'],
        });
        setSocket(newSocket);

        const onConnect = () => {
            console.log('Socket connected:', newSocket.id);
            if (user?.email) newSocket.emit('register_user', user.email);
        };
        newSocket.on('connect', onConnect);

        return () => {
            try { newSocket.off('connect', onConnect); } catch {}
            newSocket.disconnect();
        };
        // re-run if user email changes to re-register
    }, [user?.email]);

    return (
        <SocketContext.Provider value={socket}>
            {children}
        </SocketContext.Provider>
    );
};
