import { App, TFile, moment, TAbstractFile } from 'obsidian';
import { HabitTrackerSettings } from './settings';

export interface HabitCompletion {
	date: string; // YYYY-MM-DD
	completed: boolean;
}

export interface HabitData {
	name: string;
	completions: HabitCompletion[];
	currentStreak: number;
	longestStreak: number;
	completionRate: number;
	totalDaysCompleted: number;
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
		const fileName = `${today}.md`;
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
			
			// Create the file
			file = await this.app.vault.create(filePath, '');
		}
		
		return file as TFile;
	}

	/**
	 * Get habit completion status for a specific date
	 */
	async getHabitStatus(habitName: string, date: string = moment().format(this.settings.dateFormat)): Promise<boolean> {
		const fileName = `${date}.md`;
		const filePath = this.getFilePath(fileName);
		
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!file || !(file instanceof TFile)) {
			return false;
		}

		const content = await this.app.vault.read(file);
		const habitPattern = new RegExp(`- \\[([ x])\\] ${this.escapeRegex(habitName)}`, 'i');
		const match = content.match(habitPattern);
		
		return match ? match[1].toLowerCase() === 'x' : false;
	}

	/**
	 * Set habit completion status for a specific date
	 */
	async setHabitStatus(habitName: string, completed: boolean, date: string = moment().format(this.settings.dateFormat)): Promise<void> {
		const fileName = `${date}.md`;
		const filePath = this.getFilePath(fileName);
		
		let file = this.app.vault.getAbstractFileByPath(filePath);
		
		if (!file || !(file instanceof TFile)) {
			// Create the file if it doesn't exist
			if (this.settings.dailyNotesFolder) {
				const folderExists = this.app.vault.getAbstractFileByPath(this.settings.dailyNotesFolder);
				if (!folderExists) {
					await this.app.vault.createFolder(this.settings.dailyNotesFolder);
				}
			}
			file = await this.app.vault.create(filePath, '');
		}

		if (!(file instanceof TFile)) {
			throw new Error('Failed to create or access daily note file');
		}

		let content = await this.app.vault.read(file);
		const checkbox = completed ? 'x' : ' ';
		const habitPattern = new RegExp(`- \\[[ x]\\] ${this.escapeRegex(habitName)}`, 'i');
		
		if (habitPattern.test(content)) {
			// Update existing checkbox
			content = content.replace(habitPattern, `- [${checkbox}] ${habitName}`);
		} else {
			// Add new checkbox
			const habitSection = this.findOrCreateHabitSection(content);
			const checkboxLine = `- [${checkbox}] ${habitName}`;
			
			if (habitSection.end === -1) {
				// No habit section exists, add it
				content = content + (content ? '\n\n' : '') + '## Habits\n\n' + checkboxLine + '\n';
			} else {
				// Insert into existing section
				const before = content.substring(0, habitSection.end);
				const after = content.substring(habitSection.end);
				content = before + checkboxLine + '\n' + after;
			}
		}

		await this.app.vault.modify(file, content);
	}

	/**
	 * Auto-detect habits by scanning recent daily notes
	 */
	async autoDetectHabits(days: number = 30): Promise<string[]> {
		const habits = new Set<string>();
		const today = moment();
		
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
					
					// Extract habit names from checkboxes
					const checkboxPattern = /- \[[ x]\] (.+)$/gm;
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
	async getAllHabitData(): Promise<HabitData[]> {
		const habits: HabitData[] = [];
		const habitNames = this.settings.autoDetectHabits 
			? await this.autoDetectHabits()
			: this.settings.habits;

		// Ensure today's daily note contains checkbox lines for all known habits
		// so the checklist is present even when a habit hasn't been completed yet.
		await this.ensureHabitsForDate(moment().format(this.settings.dateFormat));
		
		for (const habitName of habitNames) {
			if (!habitName.trim()) continue;
			
			const completions: HabitCompletion[] = [];
			const today = moment();
			
			// Get data for the last 30 days
			for (let i = 0; i < 30; i++) {
				const date = today.clone().subtract(i, 'days');
				const dateStr = date.format(this.settings.dateFormat);
				const completed = await this.getHabitStatus(habitName, dateStr);
				completions.unshift({ date: dateStr, completed });
			}
			
			// Calculate streaks and statistics
			const { currentStreak, longestStreak } = this.calculateStreaks(completions);
			const completed = completions.filter(c => c.completed).length;
			const completionRate = completions.length > 0 ? (completed / completions.length) * 100 : 0;
			
			habits.push({
				name: habitName,
				completions,
				currentStreak,
				longestStreak,
				completionRate,
				totalDaysCompleted: completed
			});
		}
		
		return habits;
	}

	/**
	 * Ensure a given date's note contains checkbox entries for all habits.
	 * If a checkbox is missing for a habit, insert an unchecked line (`- [ ] Habit`).
	 */
	async ensureHabitsForDate(date: string): Promise<void> {
		const habitNames = this.settings.autoDetectHabits
			? await this.autoDetectHabits()
			: this.settings.habits;

		if (!habitNames || habitNames.length === 0) return;

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
			file = await this.app.vault.create(filePath, '');
		}

		if (!(file instanceof TFile)) return;

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
		const checkboxPattern = /- \[[ x]\] (.+)$/gm;
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
	 */
	private calculateStreaks(completions: HabitCompletion[]): { currentStreak: number; longestStreak: number } {
		let currentStreak = 0;
		let longestStreak = 0;
		let tempStreak = 0;
		
		// Start from today (last element) and go backwards
		for (let i = completions.length - 1; i >= 0; i--) {
			if (completions[i].completed) {
				tempStreak++;
				if (i === completions.length - 1) {
					currentStreak = tempStreak;
				}
				longestStreak = Math.max(longestStreak, tempStreak);
			} else {
				if (this.settings.streakMode === 'strict') {
					// Strict mode: any gap breaks the streak
					tempStreak = 0;
					if (i === completions.length - 1) {
						currentStreak = 0;
					}
				} else {
					// Lenient mode: only break if multiple consecutive days missed
					// For now, treat same as strict (can be enhanced later)
					tempStreak = 0;
					if (i === completions.length - 1) {
						currentStreak = 0;
					}
				}
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
			if (await this.getHabitStatus(habitName, dateStr)) {
				completed++;
			}
			total++;
		}
		
		return total > 0 ? (completed / total) * 100 : 0;
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
