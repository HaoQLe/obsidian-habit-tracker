import { PluginSettingTab, Setting, App, Plugin } from 'obsidian';

export interface HabitTrackerSettings {
	dailyNotesFolder: string;
	dateFormat: string;
	habits: string[];
	autoDetectHabits: boolean;
	streakMode: 'strict' | 'lenient';
}

export const DEFAULT_SETTINGS: HabitTrackerSettings = {
	dailyNotesFolder: '',
	dateFormat: 'YYYY-MM-DD',
	habits: [],
	autoDetectHabits: false,
	streakMode: 'strict',
}

export class HabitTrackerSettingTab extends PluginSettingTab {
	plugin: Plugin & { settings: HabitTrackerSettings; saveSettings: () => Promise<void> };

	constructor(app: App, plugin: Plugin & { settings: HabitTrackerSettings; saveSettings: () => Promise<void> }) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Habit Tracker Settings' });

		// Daily notes folder setting
		new Setting(containerEl)
			.setName('Daily notes folder')
			.setDesc('Folder where daily notes are stored (leave empty for root)')
			.addText(text => text
				.setPlaceholder('Daily Notes/')
				.setValue(this.plugin.settings.dailyNotesFolder)
				.onChange(async (value) => {
					this.plugin.settings.dailyNotesFolder = value;
					await this.plugin.saveSettings();
				}));

		// Date format setting
		new Setting(containerEl)
			.setName('Date format')
			.setDesc('Date format for daily notes (default: YYYY-MM-DD)')
			.addText(text => text
				.setPlaceholder('YYYY-MM-DD')
				.setValue(this.plugin.settings.dateFormat)
				.onChange(async (value) => {
					this.plugin.settings.dateFormat = value || 'YYYY-MM-DD';
					await this.plugin.saveSettings();
				}));

		// Auto-detect habits toggle
		new Setting(containerEl)
			.setName('Auto-detect habits')
			.setDesc('Automatically detect habits from daily notes')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoDetectHabits)
				.onChange(async (value) => {
					this.plugin.settings.autoDetectHabits = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show/hide manual habits list
				}));

		// Streak mode setting
		new Setting(containerEl)
			.setName('Streak calculation mode')
			.setDesc('How to handle gaps in habit tracking')
			.addDropdown(dropdown => dropdown
				.addOption('strict', 'Strict (any gap breaks streak)')
				.addOption('lenient', 'Lenient (allow small gaps)')
				.setValue(this.plugin.settings.streakMode)
				.onChange(async (value: 'strict' | 'lenient') => {
					this.plugin.settings.streakMode = value;
					await this.plugin.saveSettings();
				}));

		// Manual habits list (only show if auto-detect is off)
		if (!this.plugin.settings.autoDetectHabits) {
			containerEl.createEl('h3', { text: 'Habits' });

			const habitsContainer = containerEl.createDiv('habits-container');

			this.plugin.settings.habits.forEach((habit, index) => {
				const habitSetting = new Setting(habitsContainer)
					.addText(text => {
						text.setPlaceholder('Enter habit name')
							.setValue(habit)
							.onChange(async (value) => {
								this.plugin.settings.habits[index] = value;
								await this.plugin.saveSettings();
							});
					})
					.addExtraButton(button => {
						button.setIcon('trash')
							.setTooltip('Delete habit')
							.onClick(async () => {
								this.plugin.settings.habits.splice(index, 1);
								await this.plugin.saveSettings();
								this.display();
							});
					});
			});

			// Add new habit button
			new Setting(containerEl)
				.addButton(button => {
					button.setButtonText('Add Habit')
						.setCta()
						.onClick(async () => {
							this.plugin.settings.habits.push('');
							await this.plugin.saveSettings();
							this.display();
						});
				});
		} else {
			// Show info about auto-detection
			containerEl.createEl('p', { 
				text: 'Habits will be automatically detected from your daily notes.',
				cls: 'setting-item-description'
			});
		}
	}
}
