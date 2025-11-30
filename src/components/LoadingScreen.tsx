import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './LoadingScreen.scss';

const LoadingScreen: React.FC<{ onComplete?: () => void; isLoading?: boolean }> = ({ onComplete, isLoading = false }) => {
    const [progress, setProgress] = useState(0);
    const [textIndex, setTextIndex] = useState(0);

    const loadingTexts = [
        "Initializing System...",
        "Connecting to Market Data Feed...",
        "Analyzing Broker Reports...",
        "Calibrating AI Models...",
        "System Ready."
    ];

    useEffect(() => {
        const timer = setInterval(() => {
            setProgress(prev => {
                // If still loading externally, cap at 90%
                if (isLoading && prev >= 90) {
                    return 90;
                }

                // If loading finished (isLoading is false) and we are at or above 90, go to 100
                if (!isLoading && prev >= 90) {
                    return 100;
                }

                if (prev >= 100) {
                    clearInterval(timer);
                    if (onComplete) setTimeout(onComplete, 500);
                    return 100;
                }

                // Non-linear progress for realism
                const increment = Math.random() * 15;
                return Math.min(prev + increment, 100);
            });
        }, 200);

        return () => clearInterval(timer);
    }, [onComplete, isLoading]);

    useEffect(() => {
        // Change text based on progress
        if (progress < 30) setTextIndex(0);
        else if (progress < 50) setTextIndex(1);
        else if (progress < 70) setTextIndex(2);
        else if (progress < 90) setTextIndex(3);
        else setTextIndex(4);
    }, [progress]);

    return (
        <div className="loading-screen">
            <div className="loading-content">
                <motion.div
                    className="logo-container"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5 }}
                >
                    <div className="logo-ring"></div>
                    <h1 className="logo-text">Market<span>Vision</span></h1>
                </motion.div>

                <div className="progress-container">
                    <div className="progress-bar">
                        <motion.div
                            className="progress-fill"
                            style={{ width: `${progress}%` }}
                            transition={{ type: "spring", stiffness: 100 }}
                        />
                    </div>
                    <div className="progress-info">
                        <span className="percentage">{Math.round(progress)}%</span>
                    </div>
                </div>

                <div className="status-text-container">
                    <AnimatePresence mode="wait">
                        <motion.p
                            key={textIndex}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="status-text"
                        >
                            {loadingTexts[textIndex]}
                        </motion.p>
                    </AnimatePresence>
                </div>
            </div>

            <div className="background-effects">
                <div className="grid-overlay"></div>
                <div className="glow-orb orb-1"></div>
                <div className="glow-orb orb-2"></div>
            </div>
        </div>
    );
};

export default LoadingScreen;
