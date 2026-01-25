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
			containerEl.createEl('p', { 
				text: 'Drag to reorder habits',
				cls: 'setting-item-description'
			});

			const habitsContainer = containerEl.createDiv('habits-container');

			this.plugin.settings.habits.forEach((habit, index) => {
				const habitItemEl = habitsContainer.createDiv('habit-item-wrapper');
				habitItemEl.setAttribute('draggable', 'true');
				habitItemEl.setAttribute('data-index', String(index));

				const dragHandle = habitItemEl.createDiv('habit-drag-handle');
				dragHandle.innerHTML = '⋮';

				const habitInputWrapper = habitItemEl.createDiv('habit-input-wrapper');

				const textInput = habitInputWrapper.createEl('input', {
					type: 'text',
					cls: 'habit-input',
					placeholder: 'Enter habit name',
					value: habit,
				});

				textInput.addEventListener('change', async () => {
					this.plugin.settings.habits[index] = textInput.value;
					await this.plugin.saveSettings();
				});

				const deleteBtn = habitItemEl.createEl('button', {
					cls: 'habit-delete-btn',
					text: '×',
				});

				deleteBtn.addEventListener('click', async () => {
					this.plugin.settings.habits.splice(index, 1);
					await this.plugin.saveSettings();
					this.display();
				});

				// Drag event listeners
				habitItemEl.addEventListener('dragstart', (e) => {
					habitItemEl.classList.add('dragging');
					e.dataTransfer!.effectAllowed = 'move';
					e.dataTransfer!.setData('text/html', habitItemEl.innerHTML);
				});

				habitItemEl.addEventListener('dragend', () => {
					habitItemEl.classList.remove('dragging');
					document.querySelectorAll('.habit-item-wrapper').forEach(el => {
						el.classList.remove('drag-over');
					});
				});

				habitItemEl.addEventListener('dragover', (e) => {
					e.preventDefault();
					e.dataTransfer!.dropEffect = 'move';
					if (e.target !== habitItemEl && !habitItemEl.classList.contains('dragging')) {
						habitItemEl.classList.add('drag-over');
					}
				});

				habitItemEl.addEventListener('dragleave', () => {
					habitItemEl.classList.remove('drag-over');
				});

				habitItemEl.addEventListener('drop', async (e) => {
					e.preventDefault();
					const draggedItem = document.querySelector('.dragging') as HTMLElement;
					if (draggedItem && draggedItem !== habitItemEl) {
						const draggedIndex = parseInt(draggedItem.getAttribute('data-index') || '0');
						const targetIndex = parseInt(habitItemEl.getAttribute('data-index') || '0');

						// Reorder array
						const [movedHabit] = this.plugin.settings.habits.splice(draggedIndex, 1);
						const insertIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
						this.plugin.settings.habits.splice(insertIndex, 0, movedHabit);

						await this.plugin.saveSettings();
						this.display();
					}
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
