import { PluginSettingTab, Setting, App, Plugin, Modal, Notice } from 'obsidian';
import { HabitService } from './HabitService';

export interface HabitTrackerSettings {
	dailyNotesFolder: string;
	dateFormat: string;
	habits: string[];
	autoDetectHabits: boolean;
	streakMode: 'strict' | 'lenient';
	collapseAnimation: 'smooth' | 'instant';
	habitsWithValues: string[]; // Names of habits that track values
	calendarVisibleHabits: string[]; // Habits visible in calendar view (empty = all)
	chartDaysWindow: number; // Number of days to show in value charts (7, 14, or 30)
	habitActiveDays: Record<string, number[]>; // Per-habit active days (0=Sun, 1=Mon, ..., 6=Sat). Missing/empty = every day.
}

export const DEFAULT_SETTINGS: HabitTrackerSettings = {
	dailyNotesFolder: '',
	dateFormat: 'YYYY-MM-DD',
	habits: [],
	autoDetectHabits: false,
	streakMode: 'strict',
	collapseAnimation: 'smooth',
	habitsWithValues: [],
	calendarVisibleHabits: [],
	chartDaysWindow: 7,
	habitActiveDays: {},
}

export class HabitTrackerSettingTab extends PluginSettingTab {
	plugin: Plugin & { settings: HabitTrackerSettings; saveSettings: () => Promise<void>; habitService: HabitService };

	constructor(app: App, plugin: Plugin & { settings: HabitTrackerSettings; saveSettings: () => Promise<void>; habitService: HabitService }) {
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

		// Collapse animation setting
		new Setting(containerEl)
			.setName('Habit collapse animation')
			.setDesc('Animation style when collapsing/expanding habits')
			.addDropdown(dropdown => dropdown
				.addOption('smooth', 'Smooth transition')
				.addOption('instant', 'Instant')
				.setValue(this.plugin.settings.collapseAnimation)
				.onChange(async (value: 'smooth' | 'instant') => {
					this.plugin.settings.collapseAnimation = value;
					await this.plugin.saveSettings();
				}));

		// Chart days window setting
		new Setting(containerEl)
			.setName('Value chart time window')
			.setDesc('Number of days to display in value-based habit charts')
			.addDropdown(dropdown => dropdown
				.addOption('7', '7 days (1 week)')
				.addOption('14', '14 days (2 weeks)')
				.addOption('30', '30 days (1 month)')
				.setValue(String(this.plugin.settings.chartDaysWindow))
				.onChange(async (value: string) => {
					this.plugin.settings.chartDaysWindow = parseInt(value);
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

				textInput.readOnly = true;

				// Value tracking checkbox
				const valueCheckboxWrapper = habitItemEl.createDiv('habit-value-checkbox-wrapper');
				const valueCheckbox = valueCheckboxWrapper.createEl('input', {
					type: 'checkbox',
					cls: 'habit-value-checkbox',
					title: 'Track value for this habit'
				}) as HTMLInputElement;
				valueCheckbox.checked = this.plugin.settings.habitsWithValues.includes(habit);
				
				const valueLabel = valueCheckboxWrapper.createEl('label', { 
					text: 'Track value',
					cls: 'habit-value-label'
				});
				valueLabel.prepend(valueCheckbox);

				valueCheckbox.addEventListener('change', async () => {
					if (valueCheckbox.checked && habit && !this.plugin.settings.habitsWithValues.includes(habit)) {
						this.plugin.settings.habitsWithValues.push(habit);
					} else if (!valueCheckbox.checked && habit) {
						this.plugin.settings.habitsWithValues = this.plugin.settings.habitsWithValues.filter(h => h !== habit);
					}
					await this.plugin.saveSettings();
				});

				// Active days selector
				const activeDaysWrapper = habitItemEl.createDiv('habit-active-days-wrapper');
				activeDaysWrapper.createEl('span', {
					text: 'Active:',
					cls: 'habit-active-days-label'
				});
				const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
				const activeDays = this.plugin.settings.habitActiveDays[habit] || [];
				const allActive = activeDays.length === 0; // empty means every day

				for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
					const dayBtn = activeDaysWrapper.createEl('button', {
						text: dayNames[dayIdx],
						cls: 'habit-day-btn',
						title: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayIdx]
					});
					if (allActive || activeDays.includes(dayIdx)) {
						dayBtn.addClass('active');
					}
					dayBtn.addEventListener('click', async () => {
						if (!habit) return;
						let current = this.plugin.settings.habitActiveDays[habit] || [];
						if (current.length === 0) {
							// Currently "every day" — clicking a day means "only NOT this day"
							current = [0, 1, 2, 3, 4, 5, 6].filter(d => d !== dayIdx);
						} else if (current.includes(dayIdx)) {
							current = current.filter(d => d !== dayIdx);
							if (current.length === 0) {
								// Don't allow zero active days, re-enable all
								current = [];
							}
						} else {
							current.push(dayIdx);
							current.sort();
							if (current.length === 7) {
								current = []; // all days = empty array
							}
						}
						this.plugin.settings.habitActiveDays[habit] = current;
						await this.plugin.saveSettings();
						this.display();
					});
				}

				const renameBtn = habitItemEl.createEl('button', {
					cls: 'habit-rename-btn',
					text: '✏',
					title: 'Rename habit across all notes',
				});

				renameBtn.addEventListener('click', async () => {
					const currentName = this.plugin.settings.habits[index];
					if (!currentName.trim()) return;
					new RenameHabitModal(this.app, currentName, this.plugin.settings.habits, async (newName) => {
						const count = await this.plugin.habitService.renameHabit(currentName, newName);
						// Update all settings arrays
						this.plugin.settings.habits[index] = newName;
						if (this.plugin.settings.habitsWithValues.includes(currentName)) {
							this.plugin.settings.habitsWithValues = this.plugin.settings.habitsWithValues.map(h => h === currentName ? newName : h);
						}
						if (this.plugin.settings.calendarVisibleHabits.includes(currentName)) {
							this.plugin.settings.calendarVisibleHabits = this.plugin.settings.calendarVisibleHabits.map(h => h === currentName ? newName : h);
						}
						if (this.plugin.settings.habitActiveDays[currentName]) {
							this.plugin.settings.habitActiveDays[newName] = this.plugin.settings.habitActiveDays[currentName];
							delete this.plugin.settings.habitActiveDays[currentName];
						}
						await this.plugin.saveSettings();
						new Notice(`Renamed "${currentName}" to "${newName}" in ${count} note${count !== 1 ? 's' : ''}.`);
						this.display();
					}).open();
				});

				const deleteBtn = habitItemEl.createEl('button', {
					cls: 'habit-delete-btn',
					text: '×',
				});

				deleteBtn.addEventListener('click', async () => {
					const deletingHabit = this.plugin.settings.habits[index];
					this.plugin.settings.habits.splice(index, 1);
					this.plugin.settings.habitsWithValues = this.plugin.settings.habitsWithValues.filter(h => h !== deletingHabit);
					delete this.plugin.settings.habitActiveDays[deletingHabit];
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

class RenameHabitModal extends Modal {
	private oldName: string;
	private existingHabits: string[];
	private onSubmit: (newName: string) => void;

	constructor(app: App, oldName: string, existingHabits: string[], onSubmit: (newName: string) => void) {
		super(app);
		this.oldName = oldName;
		this.existingHabits = existingHabits;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h3', { text: 'Rename Habit' });

		const inputEl = contentEl.createEl('input', {
			type: 'text',
			cls: 'habit-rename-input',
			value: this.oldName,
		}) as HTMLInputElement;
		inputEl.style.width = '100%';
		inputEl.select();

		const errorEl = contentEl.createEl('p', { cls: 'habit-rename-error' });
		errorEl.style.color = 'var(--text-error)';
		errorEl.style.display = 'none';

		const btnContainer = contentEl.createDiv({ cls: 'habit-rename-buttons' });
		btnContainer.style.display = 'flex';
		btnContainer.style.justifyContent = 'flex-end';
		btnContainer.style.gap = '8px';
		btnContainer.style.marginTop = '12px';

		const cancelBtn = btnContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		const submitBtn = btnContainer.createEl('button', { text: 'Rename', cls: 'mod-cta' });

		const doSubmit = () => {
			const newName = inputEl.value.trim();
			if (!newName) {
				errorEl.setText('Name cannot be empty.');
				errorEl.style.display = 'block';
				return;
			}
			if (newName === this.oldName) {
				this.close();
				return;
			}
			if (this.existingHabits.includes(newName)) {
				errorEl.setText('A habit with this name already exists.');
				errorEl.style.display = 'block';
				return;
			}
			this.onSubmit(newName);
			this.close();
		};

		submitBtn.addEventListener('click', doSubmit);
		inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') doSubmit();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
