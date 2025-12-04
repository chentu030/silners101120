import React from 'react';

const FundBasicInfo: React.FC = () => {
    return (
        <div className="fund-basic-info" style={{ padding: '2rem', color: '#e2e8f0' }}>
            <h2 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>Fund Basic Information</h2>
            <div style={{
                backgroundColor: '#1e293b',
                padding: '2rem',
                borderRadius: '0.5rem',
                border: '1px solid #334155'
            }}>
                <p style={{ color: '#94a3b8' }}>Content for Fund Basic Information will go here.</p>
            </div>
        </div>
    );
};

export default FundBasicInfo;
