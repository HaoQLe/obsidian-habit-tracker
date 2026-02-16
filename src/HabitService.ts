import { App, TFile, moment, TAbstractFile } from 'obsidian';
import { HabitTrackerSettings } from './settings';

export interface HabitCompletion {
	date: string; // YYYY-MM-DD
	completed: boolean;
	value?: string | number; // Optional value for value-based habits (e.g., weight, distance)
}

export interface HabitData {
	name: string;
	completions: HabitCompletion[];
	currentStreak: number;
	longestStreak: number;
	completionRate: number;
	totalDaysCompleted: number;
	totalActiveDays: number; // Number of active days in the 30-day window
	isValueBased?: boolean; // Whether this habit tracks a value
}

export class HabitService {
	private app: App;
	private settings: HabitTrackerSettings;

	constructor(app: App, settings: HabitTrackerSettings) {
		this.app = app;
		this.settings = settings;
	}

	updateSettings(settings: HabitTrackerSettings) {
		this.settings = settings;
	}

	/**
	 * Get today's daily note file
	 */
	async getTodayFile(): Promise<TFile | null> {
		const today = moment().format(this.settings.dateFormat);
		const fileName = `${today}.md`;
		const filePath = this.getFilePath(fileName);
		
		const file = this.app.vault.getAbstractFileByPath(filePath);
		return file instanceof TFile ? file : null;
	}

	/**
	 * Ensure today's daily note file exists, create if it doesn't
	 */
	async ensureTodayFile(): Promise<TFile> {
		const today = moment().format(this.settings.dateFormat);
		return this.ensureDailyNoteForDate(today);
	}

	/**
	 * Ensure daily note file exists for a specific date, create if it doesn't
	 */
	async ensureDailyNoteForDate(date: string): Promise<TFile> {
		const fileName = `${date}.md`;
		const filePath = this.getFilePath(fileName);

		let file = this.app.vault.getAbstractFileByPath(filePath);

		if (!file || !(file instanceof TFile)) {
			// Create the folder if it doesn't exist
			if (this.settings.dailyNotesFolder) {
				const folderExists = this.app.vault.getAbstractFileByPath(this.settings.dailyNotesFolder);
				if (!folderExists) {
					await this.app.vault.createFolder(this.settings.dailyNotesFolder);
				}
			}

			// Create the file with a simple header
			file = await this.app.vault.create(filePath, '');
		}

		return file as TFile;
	}

	/**
	 * Get habit completion status and value for a specific date
	 */
	async getHabitStatus(habitName: string, date: string = moment().format(this.settings.dateFormat)): Promise<{ completed: boolean; value?: string | number }> {
		const fileName = `${date}.md`;
		const filePath = this.getFilePath(fileName);
		
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!file || !(file instanceof TFile)) {
			return { completed: false };
		}

		const content = await this.app.vault.read(file);
		// Match checkbox with optional value: - [x] Habit Name (value: 165)
		const habitPattern = new RegExp(`- \\[([ x])\\] ${this.escapeRegex(habitName)}(?: \\(value: ([^)]+)\\))?`, 'i');
		const match = content.match(habitPattern);
		
		if (match) {
			return {
				completed: match[1].toLowerCase() === 'x',
				value: match[2] ? match[2].trim() : undefined
			};
		}
		
		return { completed: false };
	}

	/**
	 * Set habit completion status and optional value for a specific date
	 */
	async setHabitStatus(habitName: string, completed: boolean, date: string = moment().format(this.settings.dateFormat), value?: string | number): Promise<void> {
		const file = await this.ensureDailyNoteForDate(date);

		let content = await this.app.vault.read(file);
		const checkbox = completed ? 'x' : ' ';
		const valueStr = value !== undefined && value !== '' ? ` (value: ${value})` : '';
		const newCheckboxLine = `- [${checkbox}] ${habitName}${valueStr}`;
		const habitPattern = new RegExp(`- \\[[ x]\\] ${this.escapeRegex(habitName)}(?: \\(value: [^)]+\\))?`, 'i');
		
		if (habitPattern.test(content)) {
			// Update existing checkbox
			content = content.replace(habitPattern, newCheckboxLine);
		} else {
			// Add new checkbox
			const habitSection = this.findOrCreateHabitSection(content);
			
			if (habitSection.end === -1) {
				// No habit section exists, add it
				content = content + (content ? '\n\n' : '') + '## Habits\n\n' + newCheckboxLine + '\n';
			} else {
				// Insert into existing section
				const before = content.substring(0, habitSection.end);
				const after = content.substring(habitSection.end);
				content = before + newCheckboxLine + '\n' + after;
			}
		}

		await this.app.vault.modify(file, content);
	}

	/**
	 * Auto-detect habits by scanning recent daily notes
	 */
	async autoDetectHabits(days: number = 30, baseDate?: string): Promise<string[]> {
		const habits = new Set<string>();
		const today = baseDate && moment(baseDate, this.settings.dateFormat, true).isValid()
			? moment(baseDate, this.settings.dateFormat)
			: moment();
		
		for (let i = 0; i < days; i++) {
			const date = today.clone().subtract(i, 'days');
			const dateStr = date.format(this.settings.dateFormat);
			const fileName = `${dateStr}.md`;
			const filePath = this.getFilePath(fileName);
			
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) {
				const content = await this.app.vault.read(file);
				// Find all checkboxes in Habits section
				const habitSectionMatch = content.match(/^## Habits\s*$/m);
				if (habitSectionMatch) {
					const afterSection = content.substring(habitSectionMatch.index! + habitSectionMatch[0].length);
					const nextSectionMatch = afterSection.match(/^## /m);
					const sectionContent = nextSectionMatch 
						? afterSection.substring(0, nextSectionMatch.index)
						: afterSection;
					
					// Extract habit names from checkboxes (excluding value part)
					const checkboxPattern = /- \[[ x]\] ([^(]+?)(?:\s*\(value: [^)]+\))?$/gm;
					let match;
					while ((match = checkboxPattern.exec(sectionContent)) !== null) {
						habits.add(match[1].trim());
					}
				}
			}
		}
		
		return Array.from(habits);
	}

	/**
	 * Get all habit data including completions, streaks, and statistics
	 */
	async getAllHabitData(baseDate?: string): Promise<HabitData[]> {
		const habits: HabitData[] = [];
		const baseMoment = baseDate && moment(baseDate, this.settings.dateFormat, true).isValid()
			? moment(baseDate, this.settings.dateFormat)
			: moment();
		const baseDateStr = baseMoment.format(this.settings.dateFormat);
		const habitNames = this.settings.autoDetectHabits 
			? await this.autoDetectHabits(30, baseDateStr)
			: this.settings.habits;

		// Ensure today's daily note contains checkbox lines for all known habits
		// so the checklist is present even when a habit hasn't been completed yet.
		await this.ensureHabitsForDate(baseDateStr);
		
		for (const habitName of habitNames) {
			if (!habitName.trim()) continue;
			
			const isValueBased = this.settings.habitsWithValues.includes(habitName);
			const completions: HabitCompletion[] = [];
			const today = baseMoment.clone();
			
			// Get data for the last 30 days
			for (let i = 0; i < 30; i++) {
				const date = today.clone().subtract(i, 'days');
				const dateStr = date.format(this.settings.dateFormat);
				const result = await this.getHabitStatus(habitName, dateStr);
				completions.unshift({ 
					date: dateStr, 
					completed: result.completed,
					value: result.value
				});
			}
			
			// Calculate streaks and statistics, respecting active days
			const activeDays = this.settings.habitActiveDays?.[habitName] || [];
			const { currentStreak, longestStreak } = this.calculateStreaks(completions, activeDays);
			const activeCompletions = activeDays.length > 0
				? completions.filter(c => {
					const dow = moment(c.date, this.settings.dateFormat).day();
					return activeDays.includes(dow);
				})
				: completions;
			const completed = activeCompletions.filter(c => c.completed).length;
			const totalActiveDays = activeCompletions.length;
			const completionRate = totalActiveDays > 0 ? (completed / totalActiveDays) * 100 : 0;
			
			habits.push({
				name: habitName,
				completions,
				currentStreak,
				longestStreak,
				completionRate,
				totalDaysCompleted: completed,
				totalActiveDays,
				isValueBased
			});
		}
		
		return habits;
	}

	/**
	 * List existing daily note dates in descending order (newest first)
	 */
	async getExistingDailyNoteDates(): Promise<string[]> {
		const files = this.app.vault.getFiles();
		const folderPrefix = this.settings.dailyNotesFolder
			? `${this.settings.dailyNotesFolder}/`
			: '';
		const dates = new Set<string>();

		for (const file of files) {
			if (!file.path.endsWith('.md')) continue;
			if (folderPrefix && !file.path.startsWith(folderPrefix)) continue;
			const dateStr = file.basename;
			if (moment(dateStr, this.settings.dateFormat, true).isValid()) {
				dates.add(dateStr);
			}
		}

		return Array.from(dates).sort((a, b) =>
			moment(b, this.settings.dateFormat).valueOf() - moment(a, this.settings.dateFormat).valueOf()
		);
	}

	/**
	 * Ensure a given date's note contains checkbox entries for all habits.
	 * If a checkbox is missing for a habit, insert an unchecked line (`- [ ] Habit`).
	 */
	async ensureHabitsForDate(date: string): Promise<void> {
		const habitNames = this.settings.autoDetectHabits
			? await this.autoDetectHabits(30, date)
			: this.settings.habits;

		if (!habitNames || habitNames.length === 0) return;

		const fileName = `${date}.md`;
		const filePath = this.getFilePath(fileName);

		const file = await this.ensureDailyNoteForDate(date);

		let content = await this.app.vault.read(file);

		// Ensure the Habits section exists
		const sectionPattern = /^## Habits\s*$/m;
		if (!sectionPattern.test(content)) {
			content = content + (content ? '\n\n' : '') + '## Habits\n\n';
			// write early so subsequent reads see the section
			await this.app.vault.modify(file, content);
			content = await this.app.vault.read(file);
		}

		// Re-locate the Habits section and its bounds
		const match = content.match(sectionPattern);
		const start = match ? match.index! + match[0].length : -1;
		const afterSection = start !== -1 ? content.substring(start) : '';
		const nextSectionMatch = afterSection.match(/^## /m);
		const sectionContent = nextSectionMatch
			? afterSection.substring(0, nextSectionMatch.index)
			: afterSection;

		// Collect existing habit names in the section
		// Extract habit name only (before optional "(value: ...)" part)
		const checkboxPattern = /- \[[ x]\] ([^(]+?)(?:\s*\(value: [^)]+\))?$/gm;
		const existing = new Set<string>();
		let m: RegExpExecArray | null;
		while ((m = checkboxPattern.exec(sectionContent)) !== null) {
			existing.add(m[1].trim());
		}

		// Build lines to insert for missing habits
		let linesToInsert = '';
		for (const habit of habitNames) {
			if (!habit.trim()) continue;
			if (!existing.has(habit)) {
				linesToInsert += `- [ ] ${habit}\n`;
			}
		}

		if (linesToInsert) {
			// Insert right after the Habits section header (start)
			const insertPos = start !== -1 ? start : content.length;
			const before = content.substring(0, insertPos);
			const after = content.substring(insertPos);
			content = before + linesToInsert + after;
			await this.app.vault.modify(file, content);
		}
	}

	/**
	 * Calculate streaks for a habit
	 * Current streak: consecutive completed days counting backwards, ignoring today if not completed
	 * This represents the "running" streak that can be extended if today is completed
	 */
	private calculateStreaks(completions: HabitCompletion[], activeDays: number[] = []): { currentStreak: number; longestStreak: number } {
		if (completions.length === 0) {
			return { currentStreak: 0, longestStreak: 0 };
		}

		const isActiveDay = (index: number): boolean => {
			if (activeDays.length === 0) return true; // empty = every day
			const dow = moment(completions[index].date, this.settings.dateFormat).day();
			return activeDays.includes(dow);
		};

		let longestStreak = 0;
		let tempStreak = 0;

		// First pass: calculate longest streak (skip inactive days entirely)
		for (let i = completions.length - 1; i >= 0; i--) {
			if (!isActiveDay(i)) continue; // inactive days don't affect streaks
			if (completions[i].completed) {
				tempStreak++;
				longestStreak = Math.max(longestStreak, tempStreak);
			} else {
				tempStreak = 0;
			}
		}

		// Second pass: calculate current streak
		let currentStreak = 0;
		let startIdx = completions.length - 1;

		// Skip to the most recent active day if today is inactive or not completed
		while (startIdx > 0 && !isActiveDay(startIdx)) {
			startIdx--;
		}
		// If the most recent active day is not completed, skip it (grace window)
		if (startIdx >= 0 && isActiveDay(startIdx) && !completions[startIdx].completed && startIdx > 0) {
			startIdx--;
		}

		// Count consecutive completed active days backwards
		for (let i = startIdx; i >= 0; i--) {
			if (!isActiveDay(i)) continue; // skip inactive days
			if (completions[i].completed) {
				currentStreak++;
			} else {
				break;
			}
		}

		return { currentStreak, longestStreak };
	}

	/**
	 * Get completion rate for a habit over a period
	 */
	async getCompletionRate(habitName: string, days: number = 30): Promise<number> {
		const today = moment();
		let completed = 0;
		let total = 0;
		
		for (let i = 0; i < days; i++) {
			const date = today.clone().subtract(i, 'days');
			const dateStr = date.format(this.settings.dateFormat);
			const result = await this.getHabitStatus(habitName, dateStr);
			if (result.completed) {
				completed++;
			}
			total++;
		}
		
		return total > 0 ? (completed / total) * 100 : 0;
	}

	/**
	 * Rename a habit across all daily note files.
	 * Updates checkbox lines within ## Habits sections, preserving completion status and values.
	 * Returns the number of files modified.
	 */
	async renameHabit(oldName: string, newName: string): Promise<number> {
		const files = this.app.vault.getFiles();
		const folderPrefix = this.settings.dailyNotesFolder
			? `${this.settings.dailyNotesFolder}/`
			: '';
		let modifiedCount = 0;

		for (const file of files) {
			if (!file.path.endsWith('.md')) continue;
			if (folderPrefix && !file.path.startsWith(folderPrefix)) continue;

			// Only process files that look like daily notes
			const dateStr = file.basename;
			if (!moment(dateStr, this.settings.dateFormat, true).isValid()) continue;

			const content = await this.app.vault.read(file);

			// Only modify within the ## Habits section
			const sectionMatch = content.match(/^## Habits\s*$/m);
			if (!sectionMatch) continue;

			const sectionStart = sectionMatch.index! + sectionMatch[0].length;
			const afterSection = content.substring(sectionStart);
			const nextSectionMatch = afterSection.match(/^## /m);
			const sectionEnd = nextSectionMatch
				? sectionStart + nextSectionMatch.index!
				: content.length;

			const before = content.substring(0, sectionStart);
			const sectionContent = content.substring(sectionStart, sectionEnd);
			const after = content.substring(sectionEnd);

			const habitPattern = new RegExp(
				`(- \\[[ x]\\] )${this.escapeRegex(oldName)}((?:\\s*\\(value: [^)]+\\))?)$`,
				'gmi'
			);

			if (!habitPattern.test(sectionContent)) continue;

			const updatedSection = sectionContent.replace(habitPattern, `$1${newName}$2`);
			await this.app.vault.modify(file, before + updatedSection + after);
			modifiedCount++;
		}

		return modifiedCount;
	}

	/**
	 * Clear all habits for a specific date (uncheck all)
	 */
	async clearAllHabitsForDate(date: string = moment().format(this.settings.dateFormat)): Promise<void> {
		const fileName = `${date}.md`;
		const filePath = this.getFilePath(fileName);
		
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!file || !(file instanceof TFile)) {
			return; // No file to clear
		}

		let content = await this.app.vault.read(file);
		
		// Find all habit checkboxes and uncheck them (preserve any values)
		// Pattern: - [x] Habit Name (optional: (value: xxx))
		const checkboxPattern = /- \[x\] ([^(]+?)(\s*\(value: [^)]+\))?$/gm;
		content = content.replace(checkboxPattern, (match, habitName, valuePart) => {
			return `- [ ] ${habitName}${valuePart || ''}`;
		});

		await this.app.vault.modify(file, content);
	}

	/**
	 * Find or create Habits section in content
	 */
	private findOrCreateHabitSection(content: string): { start: number; end: number } {
		const sectionPattern = /^## Habits\s*$/m;
		const match = content.match(sectionPattern);
		
		if (match) {
			const start = match.index! + match[0].length;
			// Find the end of the section (next ## or end of file)
			const afterSection = content.substring(start);
			const nextSectionMatch = afterSection.match(/^## /m);
			const end = nextSectionMatch 
				? start + nextSectionMatch.index! 
				: content.length;
			
			return { start, end };
		}
		
		return { start: -1, end: -1 };
	}

	/**
	 * Get full file path with folder prefix
	 */
	private getFilePath(fileName: string): string {
		return this.settings.dailyNotesFolder 
			? `${this.settings.dailyNotesFolder}/${fileName}`
			: fileName;
	}

	/**
	 * Escape special regex characters
	 */
	private escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}
}
