import { ItemView, WorkspaceLeaf, moment, SuggestModal, App, Notice } from 'obsidian';
import { HabitService, HabitData } from './HabitService';
import { HabitTrackerSettings } from './settings';

export const VIEW_TYPE_HABIT_TRACKER = 'habit-tracker-view';

export class HabitTrackerView extends ItemView {
	private habitService: HabitService;
	private settings: HabitTrackerSettings;
	private habitData: HabitData[] = [];
	private isRefreshing = false;
	private collapsedHabits: Set<string> = new Set();
	private saveSettings: () => Promise<void>;
	private selectedDate: string;
	private isViewingToday: boolean = true;

	constructor(leaf: WorkspaceLeaf, habitService: HabitService, settings: HabitTrackerSettings, saveSettings: () => Promise<void>) {
		super(leaf);
		this.habitService = habitService;
		this.settings = settings;
		this.saveSettings = saveSettings;
		this.selectedDate = moment().format(this.settings.dateFormat);
		this.isViewingToday = true;
	}

	getViewType() {
		return VIEW_TYPE_HABIT_TRACKER;
	}

	getDisplayText() {
		return 'Habit Tracker';
	}

	getIcon() {
		return 'check-square';
	}

	async onOpen() {
		await this.refresh();
		// Refresh every minute to update checkboxes
		this.registerInterval(window.setInterval(() => this.refresh(), 60000));
	}

	async onClose() {
		// Cleanup if needed
	}

	async refresh() {
		if (this.isRefreshing) return;
		this.isRefreshing = true;

		try {
			// If viewing "today", update selectedDate to current day (handles day changes)
			if (this.isViewingToday) {
				this.selectedDate = moment().format(this.settings.dateFormat);
			}
			this.habitData = await this.habitService.getAllHabitData(this.selectedDate);
			this.render();
		} catch (error) {
			console.error('Error refreshing habit tracker:', error);
		} finally {
			this.isRefreshing = false;
		}
	}

	render() {
		const container = this.containerEl.children[1];
		container.empty();

		const contentEl = container.createDiv('habit-tracker-container');

		// Header
		const header = contentEl.createDiv('habit-tracker-header');
		header.createEl('h2', { text: 'Daily Habits' });
		
		const dateEl = header.createDiv('habit-tracker-date');
		const displayDate = moment(this.selectedDate, this.settings.dateFormat, true).isValid()
			? moment(this.selectedDate, this.settings.dateFormat).format('dddd, MMMM D, YYYY')
			: this.selectedDate;
		dateEl.createEl('span', { text: displayDate });

		const selectDateBtn = header.createEl('button', {
			text: '📅 Select Date',
			cls: 'select-date-btn'
		});
		selectDateBtn.addEventListener('click', async () => {
			await this.promptForDateSelection();
		});

		// Insert Calendar button
		const insertCalendarBtn = header.createEl('button', {
			text: '📅 Insert Calendar',
			cls: 'insert-calendar-btn'
		});
		insertCalendarBtn.addEventListener('click', async () => {
			await this.insertCalendarIntoNote();
		});

		// Insert Chart button
		const insertChartBtn = header.createEl('button', {
			text: '📊 Insert Chart',
			cls: 'insert-chart-btn'
		});
		insertChartBtn.addEventListener('click', async () => {
			await this.insertChartIntoNote();
		});

		// Refresh button
		const refreshBtn = header.createEl('button', { 
			text: 'Refresh',
			cls: 'mod-cta'
		});
		refreshBtn.addEventListener('click', () => this.refresh());

		// Check if habits are configured
		const habitNames = this.settings.autoDetectHabits 
			? this.habitData.map(h => h.name)
			: this.settings.habits;
		
		if (habitNames.length === 0 || (this.settings.habits.length === 0 && !this.settings.autoDetectHabits)) {
			contentEl.createEl('p', { 
				text: 'No habits configured. Go to Settings to add habits or enable auto-detection.',
				cls: 'habit-tracker-empty'
			});
			return;
		}

		// Today's Checklist Section
		const checklistSection = contentEl.createDiv('habit-checklist-section');
		checklistSection.createEl('h3', { text: `Checklist for ${displayDate}` });

		const habitsList = checklistSection.createDiv('habit-checklist-list');

		for (const habit of this.habitData) {
			if (!habit.name.trim()) continue;

			const habitItem = habitsList.createDiv('habit-checklist-item');
			
			// Get selected date status first
			const selected = habit.completions[habit.completions.length - 1];
			const isCompleted = selected?.completed || false;
			
			// Apply incomplete class for visual styling
			if (!isCompleted) {
				habitItem.addClass('habit-incomplete');
			}
			
			// Checkbox
			const checkbox = habitItem.createEl('input', {
				type: 'checkbox',
				cls: 'habit-checkbox'
			}) as HTMLInputElement;

			checkbox.checked = isCompleted;

			// Label
			const label = habitItem.createEl('label', { 
				text: habit.name,
				cls: 'habit-label'
			});
			label.prepend(checkbox);

			// Value input for value-based habits
			let valueInput: HTMLInputElement | null = null;
			if (habit.isValueBased) {
				// Get previous day's value for placeholder
				let placeholderValue = 'value';
				if (habit.completions.length >= 2) {
					// Look for the most recent day with a value (excluding today)
					for (let i = habit.completions.length - 2; i >= 0; i--) {
						if (habit.completions[i].value) {
							placeholderValue = String(habit.completions[i].value);
							break;
						}
					}
				}
				
				valueInput = habitItem.createEl('input', {
					type: 'text',
					cls: 'habit-value-input',
					placeholder: placeholderValue
				}) as HTMLInputElement;
				// Only set actual value if today already has a value
				valueInput.value = selected?.value ? String(selected.value) : '';
			}

			// Streak badge or broken streak indicator
			const streakEl = habitItem.createDiv('habit-streak');
			if (habit.currentStreak > 0) {
				streakEl.createEl('span', { 
					text: `🔥 ${habit.currentStreak} day streak`,
					cls: 'streak-text'
				});
			} else if (!isCompleted) {
				streakEl.createEl('span', { 
					text: '⚠️ NOT DONE',
					cls: 'streak-text warning'
				});
			}

			// Checkbox change handler
			checkbox.addEventListener('change', async (e) => {
				const target = e.target as HTMLInputElement;
				const value = valueInput?.value;
				await this.habitService.setHabitStatus(habit.name, target.checked, this.selectedDate, value);
				await this.refresh();
			});

			// Value input change handler
			if (valueInput) {
				valueInput.addEventListener('change', async (e) => {
					const target = e.target as HTMLInputElement;
					await this.habitService.setHabitStatus(habit.name, checkbox.checked, this.selectedDate, target.value);
					await this.refresh();
				});
			}
		}

		// Statistics Section
		const statsSection = contentEl.createDiv('habit-statistics-section');
		statsSection.createEl('h3', { text: 'Statistics' });

		// Overall stats summary
		const overallStats = statsSection.createDiv('overall-stats');
		const totalHabits = this.habitData.length;
		const completedToday = this.habitData.filter(h => {
			const selected = h.completions[h.completions.length - 1];
			return selected?.completed;
		}).length;
		
		overallStats.createEl('div', { 
			text: `Completed ${displayDate}: ${completedToday}/${totalHabits}`,
			cls: 'overall-stat-item'
		});

		// Individual habit statistics
		for (const habit of this.habitData) {
			if (!habit.name.trim()) continue;

			const habitCard = statsSection.createDiv('habit-stat-card');
			
			// Apply animation class based on setting
			if (this.settings.collapseAnimation === 'instant') {
				habitCard.addClass('instant');
			}
			
			// Apply collapsed class if habit is in collapsed set
			if (this.collapsedHabits.has(habit.name)) {
				habitCard.addClass('collapsed');
			}

			// Habit name with collapse toggle
			const nameHeader = habitCard.createDiv('habit-stat-name-container');
			const nameEl = nameHeader.createEl('h4', { text: habit.name, cls: 'habit-stat-name' });
			
			const toggleBtn = nameHeader.createEl('button', {
				cls: 'collapse-toggle',
				text: '▼'
			});
			
			if (this.collapsedHabits.has(habit.name)) {
				toggleBtn.addClass('collapsed');
			}
			
			toggleBtn.addEventListener('click', () => {
				if (this.collapsedHabits.has(habit.name)) {
					this.collapsedHabits.delete(habit.name);
					habitCard.removeClass('collapsed');
					toggleBtn.removeClass('collapsed');
				} else {
					this.collapsedHabits.add(habit.name);
					habitCard.addClass('collapsed');
					toggleBtn.addClass('collapsed');
				}
			});

			// Stats grid
			const statsGrid = habitCard.createDiv('habit-stat-grid');

			// Current streak
			const streakCard = statsGrid.createDiv('stat-card');
			const selectedCompleted = habit.completions[habit.completions.length - 1]?.completed || false;
			if (habit.currentStreak === 0 && !selectedCompleted) {
				streakCard.addClass('streak-broken');
			}
			streakCard.createEl('div', { text: 'Current Streak', cls: 'stat-label' });
			streakCard.createEl('div', { 
				text: `${habit.currentStreak} days`, 
				cls: 'stat-value streak-value'
			});

			// Longest streak
			const longestStreakCard = statsGrid.createDiv('stat-card');
			longestStreakCard.createEl('div', { text: 'Longest Streak', cls: 'stat-label' });
			longestStreakCard.createEl('div', { 
				text: `${habit.longestStreak} days`, 
				cls: 'stat-value'
			});

			// Completion rate
			const rateCard = statsGrid.createDiv('stat-card');
			rateCard.createEl('div', { text: 'Completion Rate (30d)', cls: 'stat-label' });
			rateCard.createEl('div', { 
				text: `${Math.round(habit.completionRate)}%`, 
				cls: 'stat-value'
			});

			// Visual progress bar
			const progressContainer = habitCard.createDiv('progress-container');
			const progressBar = progressContainer.createDiv('progress-bar');
			progressBar.style.width = `${habit.completionRate}%`;
			progressContainer.createEl('span', { 
				text: `${habit.totalDaysCompleted}/30 days`,
				cls: 'progress-text'
			});

			// Recent activity (last 3 days)
			const recentActivity = habitCard.createDiv('recent-activity');
			recentActivity.createEl('h5', { text: 'Last 3 Days' });
			
			const activityGrid = recentActivity.createDiv('activity-grid');
			const last3Days = habit.completions.slice(-3);
			
			for (const completion of last3Days) {
				const dayEl = activityGrid.createDiv('activity-day');
				const date = new Date(completion.date);
				dayEl.createEl('div', { 
					text: date.toLocaleDateString('en-US', { weekday: 'short' }),
					cls: 'activity-day-name'
				});
				dayEl.createEl('div', {
					text: completion.completed ? '✓' : '○',
					cls: `activity-indicator ${completion.completed ? 'completed' : 'not-completed'}`
				});
			}
		}
	}

	getSelectedDate(): string {
		return this.selectedDate;
	}

	async promptForDateSelection(): Promise<void> {
		const existingDates = await this.habitService.getExistingDailyNoteDates();
		new HabitDateSelectorModal(this.app, this.settings, this.selectedDate, existingDates, async (selectedDate) => {
			this.selectedDate = selectedDate;
			// Check if the selected date is today
			const today = moment().format(this.settings.dateFormat);
			this.isViewingToday = (selectedDate === today);
			const file = await this.habitService.ensureDailyNoteForDate(selectedDate);
			await this.habitService.ensureHabitsForDate(selectedDate);
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(file);
			await this.refresh();
		}).open();
	}

	private async insertCalendarIntoNote() {
		const { vault, workspace } = this.app;
		const selectedDate = this.selectedDate;
		
		// Get or create selected date's note
		const file = await this.habitService.ensureDailyNoteForDate(selectedDate);
		
		// Read current content
		const content = await vault.read(file as any);
		
		// Check if calendar block already exists
		if (content.includes('```habit-calendar')) {
			// Open the file
			const leaf = workspace.getLeaf(false);
			await leaf.openFile(file as any);
			return;
		}
		
		// Add calendar block at the end
		const newContent = content + `\n\n\`\`\`habit-calendar\ndate: ${selectedDate}\n\`\`\`\n`;
		await vault.modify(file as any, newContent);
		
		// Open the file
		const leaf = workspace.getLeaf(false);
		await leaf.openFile(file as any);
	}

	private async insertChartIntoNote() {
		// Get all value-based habits
		const valueHabits = this.habitData.filter(h => h.isValueBased);
		
		if (valueHabits.length === 0) {
			// No value-based habits available
			new Notice('No value-based habits found. Mark habits as "Track value" in settings.');
			return;
		}
		
		// Show modal to select habit
		new HabitChartSelectorModal(this.app, valueHabits, async (selectedHabit) => {
			const { vault, workspace } = this.app;
			const selectedDate = this.selectedDate;
			
			// Get or create selected date's note
			const file = await this.habitService.ensureDailyNoteForDate(selectedDate);
			
			// Read current content
			const content = await vault.read(file as any);
			
			// Add chart block at the end with selected habit
			const newContent = content + `\n\n\`\`\`habit-chart\nhabit: ${selectedHabit}\ndate: ${selectedDate}\n\`\`\`\n`;
			await vault.modify(file as any, newContent);
			
			// Open the file
			const leaf = workspace.getLeaf(false);
			await leaf.openFile(file as any);
		}).open();
	}

	async renderChartCodeBlock(el: HTMLElement, habitName: string, baseDate?: string) {
		const container = el.createDiv('value-chart-container');
		
		if (!habitName || habitName === 'HabitName') {
			container.createEl('p', { 
				text: 'Please specify a habit name in the chart block',
				cls: 'value-chart-empty'
			});
			return;
		}
		
		// Get all habit data
		const chartBaseDate = baseDate && moment(baseDate, this.settings.dateFormat, true).isValid()
			? baseDate
			: this.selectedDate;
		const allHabitData = await this.habitService.getAllHabitData(chartBaseDate);
		const habit = allHabitData.find(h => h.name === habitName);
		
		if (!habit) {
			container.createEl('p', { 
				text: `Habit "${habitName}" not found`,
				cls: 'value-chart-empty'
			});
			return;
		}
		
		// Filter data to configured window and only include values
		const daysWindow = this.settings.chartDaysWindow || 7;
		const data = habit.completions
			.filter(c => c.value !== undefined && c.completed)
			.slice(-daysWindow)
			.map(c => ({
				date: (window as any).moment(c.date).format('MMM D'),
				day: (window as any).moment(c.date).format('ddd, MMM D'),
				value: parseFloat(String(c.value)),
				rawValue: String(c.value)
			}));
		
		if (data.length < 2) {
			container.createEl('p', { 
				text: 'Not enough data for graph (need at least 2 data points)',
				cls: 'value-chart-empty'
			});
			return;
		}
		
		// Chart title
		container.createEl('h4', { 
			text: `${habitName} - Last ${daysWindow} Days`,
			cls: 'value-chart-title'
		});
		
		// Fixed dimensions
		const width = 400;
		const height = 150;
		const padding = { top: 20, right: 20, bottom: 30, left: 40 };
		
		// Calculate scales (start Y axis at 0)
		const yMin = 0;
		const yMax = Math.max(...data.map(d => d.value));
		const yRange = yMax - yMin || 1;
		
		const xScale = (i: number) => 
			padding.left + (i / (data.length - 1)) * (width - padding.left - padding.right);
		
		const yScale = (value: number) =>
			height - padding.bottom - ((value - yMin) / yRange) * (height - padding.top - padding.bottom);
		
		// Create SVG
		const svg = container.createSvg('svg', {
			attr: {
				width: String(width),
				height: String(height),
				class: 'value-line-chart'
			}
		});
		
		// Draw Y axis
		svg.createSvg('line', {
			attr: {
				x1: String(padding.left),
				y1: String(padding.top),
				x2: String(padding.left),
				y2: String(height - padding.bottom),
				stroke: 'var(--text-muted)',
				'stroke-width': '1'
			}
		});
		
		// Draw X axis
		svg.createSvg('line', {
			attr: {
				x1: String(padding.left),
				y1: String(height - padding.bottom),
				x2: String(width - padding.right),
				y2: String(height - padding.bottom),
				stroke: 'var(--text-muted)',
				'stroke-width': '1'
			}
		});
		
		// Draw line
		const pathData = data.map((d, i) => 
			`${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.value)}`
		).join(' ');
		
		svg.createSvg('path', {
			attr: {
				d: pathData,
				fill: 'none',
				stroke: 'var(--interactive-accent)',
				'stroke-width': '2'
			}
		});
		
		// Draw points with titles for hover
		data.forEach((d, i) => {
			const circle = svg.createSvg('circle', {
				attr: {
					cx: String(xScale(i)),
					cy: String(yScale(d.value)),
					r: '4',
					fill: 'var(--interactive-accent)',
					class: 'chart-point'
				}
			});
			
			// Add title element for tooltip
			const title = svg.createSvg('title');
			title.textContent = `${d.day}: ${d.rawValue}`;
			circle.appendChild(title);
		});
		
		// Add Y-axis labels
		svg.createSvg('text', {
			attr: {
				x: String(padding.left - 5),
				y: String(yScale(yMax)),
				'text-anchor': 'end',
				'alignment-baseline': 'middle',
				'font-size': '10',
				fill: 'var(--text-muted)',
				class: 'chart-label'
			}
		}).textContent = yMax.toFixed(1);
		
		svg.createSvg('text', {
			attr: {
				x: String(padding.left - 5),
				y: String(yScale(yMin)),
				'text-anchor': 'end',
				'alignment-baseline': 'middle',
				'font-size': '10',
				fill: 'var(--text-muted)',
				class: 'chart-label'
			}
		}).textContent = yMin.toFixed(1);
		
		// Add date labels (first and last)
		if (data.length > 0) {
			svg.createSvg('text', {
				attr: {
					x: String(xScale(0)),
					y: String(height - padding.bottom + 15),
					'text-anchor': 'start',
					'font-size': '10',
					fill: 'var(--text-muted)',
					class: 'chart-label'
				}
			}).textContent = data[0].date;
			
			svg.createSvg('text', {
				attr: {
					x: String(xScale(data.length - 1)),
					y: String(height - padding.bottom + 15),
					'text-anchor': 'end',
					'font-size': '10',
					fill: 'var(--text-muted)',
					class: 'chart-label'
				}
			}).textContent = data[data.length - 1].date;
		}
	}
}

class HabitDateSelectorModal extends SuggestModal<string> {
	private settings: HabitTrackerSettings;
	private onSelect: (date: string) => void;
	private baseDates: string[];
	private existingDates: string[];

	constructor(app: App, settings: HabitTrackerSettings, selectedDate: string, existingDates: string[], onSelect: (date: string) => void) {
		super(app);
		this.settings = settings;
		this.onSelect = onSelect;
		this.baseDates = this.buildBaseDates(selectedDate);
		this.existingDates = existingDates;
		this.setPlaceholder(`Enter date (${this.settings.dateFormat})`);
	}

	getSuggestions(query: string): string[] {
		const trimmed = query.trim();
		const lowerQuery = trimmed.toLowerCase();
		const sourceDates = this.existingDates.length > 0 ? this.existingDates : this.baseDates;
		const matches = sourceDates.filter(date => date.toLowerCase().includes(lowerQuery));
		const parsed = this.parseDateInput(trimmed);
		if (parsed && !matches.includes(parsed)) {
			matches.unshift(parsed);
		}
		return matches;
	}

	renderSuggestion(date: string, el: HTMLElement) {
		const label = moment(date, this.settings.dateFormat, true).isValid()
			? moment(date, this.settings.dateFormat).format('ddd, MMM D, YYYY')
			: date;
		el.createEl('div', { text: label });
		el.createEl('small', { text: date, cls: 'habit-date-suggestion' });
	}

	onChooseSuggestion(date: string, evt: MouseEvent | KeyboardEvent) {
		this.onSelect(date);
	}

	private parseDateInput(input: string): string | null {
		if (!input) return null;
		const formats = [
			this.settings.dateFormat,
			'YYYY-MM-DD',
			'MM/DD/YYYY',
			'MMM D, YYYY'
		];
		const parsed = moment(input, formats, true);
		return parsed.isValid() ? parsed.format(this.settings.dateFormat) : null;
	}

	private buildBaseDates(selectedDate: string): string[] {
		const base = moment(selectedDate, this.settings.dateFormat, true).isValid()
			? moment(selectedDate, this.settings.dateFormat)
			: moment();
		const dates: string[] = [];
		for (let i = 0; i < 30; i++) {
			dates.push(base.clone().subtract(i, 'days').format(this.settings.dateFormat));
		}
		return dates;
	}
}

// Modal for selecting which habit to chart
class HabitChartSelectorModal extends SuggestModal<string> {
	private habits: HabitData[];
	private onSelect: (habit: string) => void;
	
	constructor(app: App, habits: HabitData[], onSelect: (habit: string) => void) {
		super(app);
		this.habits = habits;
		this.onSelect = onSelect;
		this.setPlaceholder('Select a habit to chart...');
	}
	
	getSuggestions(query: string): string[] {
		const lowerQuery = query.toLowerCase();
		return this.habits
			.map(h => h.name)
			.filter(name => name.toLowerCase().includes(lowerQuery));
	}
	
	renderSuggestion(habit: string, el: HTMLElement) {
		el.createEl('div', { text: habit });
	}
	
	onChooseSuggestion(habit: string, evt: MouseEvent | KeyboardEvent) {
		this.onSelect(habit);
	}
}
