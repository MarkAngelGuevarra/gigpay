import React from 'react';

const TaskProgress = ({ status }) => {
  const steps = ['Available', 'In Progress', 'Completed'];
  let currentStep = steps.indexOf(status);
  
  if (status === 'Disputed' || status === 'Under Review') {
    currentStep = 1; // It's at In Progress / Review stage
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', width: '100%', marginTop: '1rem', marginBottom: '0.5rem', gap: '0.5rem' }}>
      {steps.map((step, index) => {
        const isCompleted = index <= currentStep && status !== 'Disputed';
        const isDisputed = index === 1 && status === 'Disputed';
        
        let color = 'var(--border)';
        if (isCompleted) color = 'var(--accent)';
        if (isDisputed) color = '#ef4444';

        return (
          <React.Fragment key={step}>
            <div style={{ display: 'flex', flexDirection: 'column', flex: index < steps.length - 1 ? 1 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                <div style={{ 
                  width: '12px', height: '12px', borderRadius: '50%', 
                  backgroundColor: color,
                  boxShadow: isCompleted || isDisputed ? `0 0 8px ${color}` : 'none'
                }}></div>
                {index < steps.length - 1 && (
                  <div style={{ flex: 1, height: '2px', backgroundColor: index < currentStep ? 'var(--accent)' : 'var(--border)', margin: '0 4px' }}></div>
                )}
              </div>
              <span style={{ fontSize: '0.75rem', color: isCompleted || isDisputed ? 'white' : 'var(--text-muted)', marginTop: '0.25rem', whiteSpace: 'nowrap' }}>
                {isDisputed && index === 1 ? 'Disputed' : step === 'Completed' ? 'Paid' : step === 'Available' ? 'Funded' : step}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default TaskProgress;
