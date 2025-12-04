import React, { useState } from 'react';
import { List, Newspaper, Settings, LogOut, FileText, ChevronLeft, ChevronRight, Home, PieChart, ChevronDown, ChevronUp, LineChart } from 'lucide-react';
import './Sidebar.scss';

interface SidebarProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
    onLogout?: () => void;
    onLogoClick?: () => void;
}

interface MenuItem {
    id: string;
    label: string;
    icon: any;
    subItems?: { id: string; label: string }[];
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, onLogout, onLogoClick }) => {
    const [isCollapsed, setIsCollapsed] = useState(() => {
        if (typeof window !== 'undefined') {
            return window.innerWidth <= 768;
        }
        return false;
    });

    const [expandedMenus, setExpandedMenus] = useState<string[]>(['fund', 'tw-stock']);

    const toggleSubMenu = (menuId: string) => {
        setExpandedMenus(prev =>
            prev.includes(menuId)
                ? prev.filter(id => id !== menuId)
                : [...prev, menuId]
        );
    };

    const menuItems: MenuItem[] = [
        { id: 'home', label: 'Home', icon: Home },
        {
            id: 'tw-stock',
            label: 'Taiwan Stock',
            icon: LineChart,
            subItems: [
                { id: 'dashboard', label: 'Dashboard' },
                { id: 'market', label: 'Market Overview' },
                { id: 'statistics', label: 'Statistics' },
                { id: 'chips', label: 'Brokerage Branch' },
            ]
        },
        {
            id: 'fund',
            label: 'Fund',
            icon: PieChart,
            subItems: [
                { id: 'fund-basic', label: 'Basic Information' },
                { id: 'fund-ranking', label: 'Historical Ranking' }
            ]
        },
        { id: 'articles', label: 'Articles', icon: FileText },
        { id: 'watchlist', label: 'Watchlist', icon: List },
        { id: 'news', label: 'News', icon: Newspaper },
        { id: 'settings', label: 'Settings', icon: Settings },
    ];

    return (
        <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
            <button
                className="collapse-toggle"
                onClick={() => setIsCollapsed(!isCollapsed)}
                title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
                {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>

            <div className="sidebar-logo" onClick={onLogoClick}>
                <div className={`logo-container ${isCollapsed ? 'collapsed' : ''}`}>
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="logo-icon">
                        <rect width="32" height="32" rx="8" fill="url(#logo-gradient)" fillOpacity="0.1" />
                        <path d="M8 22L14 14L19 19L25 11" stroke="url(#logo-gradient)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M21 11H25V15" stroke="url(#logo-gradient)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        <defs>
                            <linearGradient id="logo-gradient" x1="0" y1="32" x2="32" y2="0" gradientUnits="userSpaceOnUse">
                                <stop stopColor="#3b82f6" />
                                <stop offset="1" stopColor="#8b5cf6" />
                            </linearGradient>
                        </defs>
                    </svg>
                    {!isCollapsed && (
                        <h2 className="logo-text">Market<span>Vision</span></h2>
                    )}
                </div>
            </div>

            <nav className="sidebar-nav">
                {menuItems.map((item) => {
                    const Icon = item.icon;
                    const isExpanded = expandedMenus.includes(item.id);
                    const isActive = activeTab === item.id || (item.subItems && item.subItems.some(sub => sub.id === activeTab));

                    return (
                        <div key={item.id} className="nav-item-container">
                            <button
                                className={`nav-item ${isActive ? 'active' : ''}`}
                                onClick={() => {
                                    if (item.subItems) {
                                        if (isCollapsed) setIsCollapsed(false);
                                        toggleSubMenu(item.id);
                                    } else {
                                        onTabChange(item.id);
                                    }
                                }}
                                title={isCollapsed ? item.label : ''}
                            >
                                <Icon size={20} />
                                {!isCollapsed && (
                                    <>
                                        <span className="label">{item.label}</span>
                                        {item.subItems && (
                                            <span className="submenu-arrow">
                                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                            </span>
                                        )}
                                    </>
                                )}
                                {isActive && !item.subItems && <div className="active-indicator" />}
                            </button>

                            {!isCollapsed && item.subItems && isExpanded && (
                                <div className="submenu">
                                    {item.subItems.map(subItem => (
                                        <button
                                            key={subItem.id}
                                            className={`submenu-item ${activeTab === subItem.id ? 'active' : ''}`}
                                            onClick={() => onTabChange(subItem.id)}
                                        >
                                            <span className="dot"></span>
                                            <span className="label">{subItem.label}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </nav>

            <div className="sidebar-footer">
                <button className="nav-item logout" onClick={onLogout} title={isCollapsed ? "Logout" : ''}>
                    <LogOut size={20} />
                    {!isCollapsed && <span className="label">Logout</span>}
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
