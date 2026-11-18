const STAGES = [
  { key: 'Available', label: 'Funded' },
  { key: 'In Progress', label: 'In Progress' },
  { key: 'Under Review', label: 'Under Review' },
  { key: 'Completed', label: 'Paid' },
];

const resolveStageIndex = (status) => {
  if (status === 'Completed' || status === 'Paid') return 3;
  if (status === 'Under Review') return 2;
  if (status === 'In Progress' || status === 'Disputed') return 1;
  if (status === 'Available') return 0;
  return -1;
};

const TaskProgress = ({ status }) => {
  const isDisputed = status === 'Disputed';
  const isFailed = status === 'Failed';
  const isConfirming = status === 'Confirming';
  const activeIndex = resolveStageIndex(status);

  return (
    <div className="gp-stepper" role="list" aria-label={`Escrow progress: ${status || 'Unknown'}`}>
      {STAGES.map((stage, index) => {
        let modifier = '';
        let label = stage.label;

        if (isFailed && index === 0) {
          modifier = 'gp-stepper-step--danger';
          label = 'Failed';
        } else if (isConfirming && index === 0) {
          modifier = 'gp-stepper-step--warn';
          label = 'Confirming';
        } else if (isDisputed && index === 1) {
          modifier = 'gp-stepper-step--danger';
          label = 'Disputed';
        } else if (isDisputed && index === 0) {
          modifier = 'gp-stepper-step--done';
        } else if (!isDisputed && activeIndex >= 0) {
          if (index < activeIndex || (activeIndex === 3 && index === 3)) {
            modifier = 'gp-stepper-step--done';
          } else if (index === activeIndex) {
            modifier = 'gp-stepper-step--active';
          }
        }

        return (
          <div
            key={stage.key}
            role="listitem"
            className={`gp-stepper-step${modifier ? ` ${modifier}` : ''}`}
          >
            <div className="gp-stepper-bar" aria-hidden="true" />
            <span className="gp-stepper-label">{label}</span>
          </div>
        );
      })}
    </div>
  );
};

export default TaskProgress;
