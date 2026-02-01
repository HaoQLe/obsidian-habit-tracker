import { Plugin } from 'obsidian';
import { HabitTrackerView, VIEW_TYPE_HABIT_TRACKER } from './HabitTrackerView';
import { HabitService } from './HabitService';
import { HabitTrackerSettings, DEFAULT_SETTINGS } from './settings';
import { HabitTrackerSettingTab } from './settings';

export default class HabitTrackerPlugin extends Plugin {
	settings: HabitTrackerSettings;
	habitService: HabitService;

	async onload() {
		await this.loadSettings();
		
		this.habitService = new HabitService(this.app, this.settings);

		// Register view
		this.registerView(
			VIEW_TYPE_HABIT_TRACKER,
			(leaf) => new HabitTrackerView(leaf, this.habitService, this.settings, () => this.saveSettings())
		);

		// Add ribbon icon
		this.addRibbonIcon('check-square', 'Open Habit Tracker', () => {
			this.openHabitTrackerView();
		});

		// Add commands
		this.addCommand({
			id: 'open-habit-tracker',
			name: 'Open Habit Tracker',
			callback: () => {
				this.openHabitTrackerView();
			},
			hotkeys: [
				{
					modifiers: ['Mod'],
					key: 'h',
				},
			],
		});

		this.addCommand({
			id: 'select-habit-tracker-date',
			name: 'Select Habit Tracker Date',
			callback: async () => {
				const { workspace } = this.app;
				let leaf = workspace.getLeavesOfType(VIEW_TYPE_HABIT_TRACKER)[0];
				if (!leaf) {
					leaf = workspace.getRightLeaf(false);
					await leaf.setViewState({ type: VIEW_TYPE_HABIT_TRACKER, active: true });
				}
				workspace.revealLeaf(leaf);
				const view = leaf.view as HabitTrackerView;
				await view.promptForDateSelection();
			}
		});

		// Add toggle commands for each habit
		this.addCommandsForHabits();

		// Register code block processor for embedding calendar in notes
		this.registerMarkdownCodeBlockProcessor('habit-calendar', async (source, el, ctx) => {
			await this.renderCalendarCodeBlock(el, source);
		});

		// Register code block processor for embedding value charts in notes
		this.registerMarkdownCodeBlockProcessor('habit-chart', async (source, el, ctx) => {
			const habitName = source.match(/habit:\s*(.+)/)?.[1]?.trim();
			const baseDate = source.match(/date:\s*(.+)/)?.[1]?.trim();
			const view = this.app.workspace.getLeavesOfType(VIEW_TYPE_HABIT_TRACKER)[0]?.view as HabitTrackerView;
			if (view) {
				await view.renderChartCodeBlock(el, habitName || '', baseDate);
			}
		});

		// Settings tab
		this.addSettingTab(new HabitTrackerSettingTab(this.app, this));
	}

	onunload() {
		// Clean up views
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_HABIT_TRACKER);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Update habit service with new settings
		if (this.habitService) {
			this.habitService.updateSettings(this.settings);
		}
		// Re-register commands if habits changed
		this.addCommandsForHabits();
	}

	async openHabitTrackerView() {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_HABIT_TRACKER)[0];
		
		if (leaf) {
			// View exists - check if it's focused
			if (leaf.getDisplayText() === workspace.activeLeaf?.getDisplayText()) {
				// Close it by detaching the leaf
				leaf.detach();
			} else {
				// Reveal it if not focused
				workspace.revealLeaf(leaf);
			}
		} else {
			// Create new view
			leaf = workspace.getRightLeaf(false);
			await leaf.setViewState({ type: VIEW_TYPE_HABIT_TRACKER, active: true });
			workspace.revealLeaf(leaf);
		}
	}

	/**
	 * Add toggle commands for each configured habit
	 */
	private addCommandsForHabits() {
		// Note: Obsidian doesn't provide a direct way to remove commands,
		// but we can add new ones and they will override if IDs match
		
		// Add commands for current habits
		for (const habit of this.settings.habits) {
			if (!habit.trim()) continue;
			
			this.addCommand({
				id: `toggle-habit-${habit.toLowerCase().replace(/\s+/g, '-')}`,
				name: `Toggle Habit: ${habit}`,
				callback: async () => {
					const currentStatus = await this.habitService.getHabitStatus(habit);
					await this.habitService.setHabitStatus(habit, !currentStatus);
					// Refresh view if open
					const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_HABIT_TRACKER);
					for (const leaf of leaves) {
						if (leaf.view instanceof HabitTrackerView) {
							await leaf.view.refresh();
						}
					}
				}
			});
		}
	}

	private async renderCalendarCodeBlock(container: HTMLElement, source?: string) {
		const moment = (window as any).moment;
		const baseDate = source?.match(/date:\s*(.+)/)?.[1]?.trim();
		const view = this.app.workspace.getLeavesOfType(VIEW_TYPE_HABIT_TRACKER)[0]?.view as HabitTrackerView | undefined;
		const fallbackDate = view?.getSelectedDate();
		const baseMoment = baseDate && moment(baseDate, this.settings.dateFormat, true).isValid()
			? moment(baseDate, this.settings.dateFormat)
			: (fallbackDate && moment(fallbackDate, this.settings.dateFormat, true).isValid()
				? moment(fallbackDate, this.settings.dateFormat)
				: moment());
		
		// Get habit data
		const habitData = await this.habitService.getAllHabitData(baseMoment.format(this.settings.dateFormat));
		
		if (habitData.length === 0) {
			container.createEl('p', { 
				text: 'No habits configured. Go to Settings to add habits or enable auto-detection.',
				cls: 'habit-tracker-empty'
			});
			return;
		}

		// Filter visible habits
		const selectedHabits = this.settings.calendarVisibleHabits.length === 0 
			? habitData.map(h => h.name)
			: this.settings.calendarVisibleHabits;
		const visibleHabits = habitData.filter(habit => selectedHabits.includes(habit.name));

		// Habit selector bar
		const selectorBar = container.createDiv('habit-selector-bar');
		selectorBar.createEl('span', { text: 'Show habits:', cls: 'selector-label' });

		const selectorCheckboxes = selectorBar.createDiv('selector-checkboxes');
		
		for (const habit of habitData) {
			const label = selectorCheckboxes.createEl('label', { cls: 'habit-selector-checkbox' });
			const checkbox = label.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
			checkbox.checked = selectedHabits.includes(habit.name);
			label.appendText(habit.name);

			checkbox.addEventListener('change', async () => {
				if (checkbox.checked) {
					if (this.settings.calendarVisibleHabits.length === 0) {
						this.settings.calendarVisibleHabits = habitData.map(h => h.name);
					}
					if (!this.settings.calendarVisibleHabits.includes(habit.name)) {
						this.settings.calendarVisibleHabits.push(habit.name);
					}
				} else {
					if (this.settings.calendarVisibleHabits.length === 0) {
						this.settings.calendarVisibleHabits = habitData.map(h => h.name);
					}
					this.settings.calendarVisibleHabits = this.settings.calendarVisibleHabits.filter(h => h !== habit.name);
				}
				await this.saveSettings();
				// Re-render
				container.empty();
				await this.renderCalendarCodeBlock(container, source);
			});
		}

		const selectorButtons = selectorBar.createDiv('selector-buttons');
		const selectAllBtn = selectorButtons.createEl('button', { text: 'Select All', cls: 'selector-btn' });
		selectAllBtn.addEventListener('click', async () => {
			this.settings.calendarVisibleHabits = [];
			await this.saveSettings();
			container.empty();
			await this.renderCalendarCodeBlock(container, source);
		});

		const clearAllBtn = selectorButtons.createEl('button', { text: 'Clear All', cls: 'selector-btn' });
		clearAllBtn.addEventListener('click', async () => {
			// Clear all habit selections (uncheck all from "Show habits")
			// Use a marker value to indicate "show none"
			this.settings.calendarVisibleHabits = ['__NONE__'];
			await this.saveSettings();
			container.empty();
			await this.renderCalendarCodeBlock(container, source);
		});

		if (visibleHabits.length === 0) {
			container.createEl('p', { 
				text: 'No habits selected. Please select habits from the list above.',
				cls: 'habit-tracker-empty'
			});
			return;
		}

		// Build calendar grid
		const today = baseMoment.clone();
		const startOfWeek = baseMoment.clone().startOf('isoWeek');
		const endOfWeek = baseMoment.clone().endOf('isoWeek');

		const dates: Array<{ dateString: string; dayOfMonth: string; isToday: boolean }> = [];
		const current = startOfWeek.clone();
		while (current.isSameOrBefore(endOfWeek, 'day')) {
			dates.push({
				dateString: current.format(this.settings.dateFormat),
				dayOfMonth: current.format('D'),
				isToday: current.isSame(today, 'day')
			});
			current.add(1, 'day');
		}

		// Render calendar grid
		const calendarContainer = container.createDiv('habit-calendar-container');
		const grid = calendarContainer.createDiv('habit-calendar-grid');
		grid.style.gridTemplateColumns = 'minmax(150px, 200px) repeat(7, 1fr)';

		// Header row
		grid.createDiv('calendar-header-cell empty');
		const dayNames = ['M', 'Tu', 'W', 'Th', 'F', 'Sa', 'Su'];
		for (const dayName of dayNames) {
			const dayHeader = grid.createDiv('calendar-header-cell');
			dayHeader.setText(dayName);
		}

		// Date row
		grid.createDiv('calendar-date-cell empty');
		for (const date of dates) {
			const dateCell = grid.createDiv('calendar-date-cell');
			dateCell.setText(date.dayOfMonth);
			if (date.isToday) {
				dateCell.addClass('today');
			}
		}

		// Habit rows
		for (const habit of visibleHabits) {
			const nameCell = grid.createDiv('calendar-habit-name');
			nameCell.setText(habit.name);

			for (const date of dates) {
				const checkboxCell = grid.createDiv('calendar-checkbox-cell');
				const completion = habit.completions.find(c => c.date === date.dateString);
				const isCompleted = completion?.completed || false;

				const checkbox = checkboxCell.createEl('input', {
					type: 'checkbox',
					cls: 'calendar-checkbox'
				}) as HTMLInputElement;
				checkbox.checked = isCompleted;
				checkbox.setAttribute('data-habit', habit.name);
				checkbox.setAttribute('data-date', date.dateString);

				checkbox.addEventListener('change', async (e) => {
					const target = e.target as HTMLInputElement;
					const habitName = target.getAttribute('data-habit')!;
					const dateString = target.getAttribute('data-date')!;
					await this.habitService.setHabitStatus(habitName, target.checked, dateString);
					checkbox.checked = target.checked;
				});
			}
		}
	}
}
