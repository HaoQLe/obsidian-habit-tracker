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
			(leaf) => new HabitTrackerView(leaf, this.habitService, this.settings)
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

		// Add toggle commands for each habit
		this.addCommandsForHabits();

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
}
