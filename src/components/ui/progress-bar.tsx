interface TerminalProgressBarProps {
	label?: string;
	style?: "hash" | "equal" | "block" | "dot" | "arrow";
	duration?: number;
	showSpinner?: boolean;
	showPercentage?: boolean;
	className?: string;
}

export const ProgressBar = ({
	label = "Processing...",
	duration = 0.5,
	showSpinner = true,
	showPercentage = true,
	className = "w-96",
}: TerminalProgressBarProps) => {
	return (
		<div className={`my-5 ${className}`}>
			<style>{`
        @keyframes terminal-fill-progress {
          0% { width: 0; }
          100% { width: 100%; }
        }

        .terminal-progress-fill {
          display: inline-block;
          animation: terminal-fill-progress ${duration}s ease-in-out infinite;
          background-color: inherit;
          position: relative;
          z-index: 1;
        }

        .terminal-progress-fill::before {
          content: '####################################################################################';
          display: inline-block;
          overflow: hidden;
          max-width: 100%;
        }

        @keyframes terminal-count-up {
          0% { content: '[  0%]'; }
          10% { content: '[ 10%]'; }
          20% { content: '[ 20%]'; }
          30% { content: '[ 30%]'; }
          40% { content: '[ 40%]'; }
          50% { content: '[ 50%]'; }
          60% { content: '[ 60%]'; }
          70% { content: '[ 70%]'; }
          80% { content: '[ 80%]'; }
          90% { content: '[ 90%]'; }
          100% { content: '[100%]'; }
        }

        .terminal-progress-percent::before {
          content: '[  0%]';
          animation: terminal-count-up ${duration}s steps(10) infinite;
        }

        @keyframes terminal-spin {
          0%, 24.99% { content: '|'; }
          25%, 49.99% { content: '/'; }
          50%, 74.99% { content: '-'; }
          75%, 99.99% { content: '\\\\'; }
        }

        .terminal-spinner::after {
          content: '|';
          display: inline-block;
          animation: terminal-spin 0.8s linear infinite;
        }
      `}</style>

			<div className="mb-1 font-mono text-sm">{label}</div>
			<div
				className={`flex items-center gap-2.5 whitespace-nowrap bg-inherit font-mono text-base`}
			>
				{showSpinner && (
					<span className="terminal-spinner inline-block w-[1ch] text-center"></span>
				)}
				<span>[</span>
				<span className="terminal-progress-track relative flex-1 overflow-hidden bg-inherit">
					<span className="terminal-progress-fill"></span>
				</span>
				<span>]</span>
				{showPercentage && (
					<span className="terminal-progress-percent min-w-[50px] text-right"></span>
				)}
			</div>
		</div>
	);
};
