import { ItemView, WorkspaceLeaf } from 'obsidian';
import { HabitService, HabitData } from './HabitService';
import { HabitTrackerSettings } from './settings';

export const VIEW_TYPE_HABIT_TRACKER = 'habit-tracker-view';

export class HabitTrackerView extends ItemView {
	private habitService: HabitService;
	private settings: HabitTrackerSettings;
	private habitData: HabitData[] = [];
	private isRefreshing = false;
	private collapsedHabits: Set<string> = new Set();

	constructor(leaf: WorkspaceLeaf, habitService: HabitService, settings: HabitTrackerSettings) {
		super(leaf);
		this.habitService = habitService;
		this.settings = settings;
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
			this.habitData = await this.habitService.getAllHabitData();
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
		dateEl.createEl('span', { 
			text: new Date().toLocaleDateString('en-US', { 
				weekday: 'long', 
				year: 'numeric', 
				month: 'long', 
				day: 'numeric' 
			}) 
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
		checklistSection.createEl('h3', { text: "Today's Checklist" });

		const habitsList = checklistSection.createDiv('habit-checklist-list');

		for (const habit of this.habitData) {
			if (!habit.name.trim()) continue;

			const habitItem = habitsList.createDiv('habit-checklist-item');
			
			// Get today's status first
			const today = habit.completions[habit.completions.length - 1];
			const isCompleted = today?.completed || false;
			
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
				valueInput.value = today?.value ? String(today.value) : '';
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
				await this.habitService.setHabitStatus(habit.name, target.checked, undefined, value);
				await this.refresh();
			});

			// Value input change handler
			if (valueInput) {
				valueInput.addEventListener('change', async (e) => {
					const target = e.target as HTMLInputElement;
					await this.habitService.setHabitStatus(habit.name, checkbox.checked, undefined, target.value);
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
			const today = h.completions[h.completions.length - 1];
			return today?.completed;
		}).length;
		
		overallStats.createEl('div', { 
			text: `Completed Today: ${completedToday}/${totalHabits}`,
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
			const todayCompleted = habit.completions[habit.completions.length - 1]?.completed || false;
			if (habit.currentStreak === 0 && !todayCompleted) {
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
}
