import * as vscode from 'vscode';
import { CommandItem } from './extension'; // Import CommandItem interface

const COMMAND_FILE_SCHEME = 'commandfile'; // Our custom URI scheme

export class CommandFileSystemProvider implements vscode.FileSystemProvider {
    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

    // A simple map to store our commands.
    // Key: filename (e.g., "My Command.cmd"), Value: CommandItem
    private _commands: Map<string, CommandItem> = new Map<string, CommandItem>();
    private _context: vscode.ExtensionContext; // Store context to access globalState

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        this.loadCommandsFromGlobalState(); // Load existing commands on initialization
    }

    private loadCommandsFromGlobalState() {
        const storedCommands: CommandItem[] = this._context.globalState.get('customCommands', []);
        this._commands.clear();
        storedCommands.forEach(cmd => {
            // Reconstruct filename based on the same logic used for creation/display
            const fileName = this.generateFileName(cmd);
            this._commands.set(fileName, cmd);
        });
    }

    private async saveCommandsToGlobalState() {
        const commandsArray: CommandItem[] = Array.from(this._commands.values());
        await this._context.globalState.update('customCommands', commandsArray);
        // Fire a generic refresh for the TreeDataProvider
        this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri: vscode.Uri.parse(`${COMMAND_FILE_SCHEME}:/`) }]);
    }

    // Helper to generate a consistent filename for a CommandItem
    private generateFileName(item: CommandItem): string {
        let baseName = item.name && item.name.trim() !== '' ? item.name : item.command.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '_');
        if (baseName.length === 0) baseName = 'untitled_command'; // Fallback for empty command string
        return `${baseName}.cmd`;
    }

    // --- FileSystemProvider methods ---

    watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
        return new vscode.Disposable(() => { /* no-op */ });
    }

    stat(uri: vscode.Uri): vscode.FileStat | Thenable<vscode.FileStat> {
        if (uri.path === '/') { // Root directory
            return {
                type: vscode.FileType.Directory,
                ctime: Date.now(),
                mtime: Date.now(),
                size: 0
            };
        }

        const fileName = uri.path.substring(1); // Remove leading '/'
        if (this._commands.has(fileName)) {
            const item = this._commands.get(fileName)!;
            const contentBuffer = Buffer.from(item.command, 'utf8');
            return {
                type: vscode.FileType.File,
                ctime: Date.now(),
                mtime: Date.now(),
                size: contentBuffer.byteLength
            };
        }
        throw vscode.FileSystemError.FileNotFound(uri);
    }

    readDirectory(uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
        if (uri.path === '/') {
            return Array.from(this._commands.keys()).map(key => [key, vscode.FileType.File]);
        }
        throw vscode.FileSystemError.FileNotADirectory(uri);
    }

    readFile(uri: vscode.Uri): Uint8Array | Thenable<Uint8Array> {
        const fileName = uri.path.substring(1);
        if (this._commands.has(fileName)) {
            const item = this._commands.get(fileName)!;
            return Buffer.from(item.command, 'utf8');
        }
        throw vscode.FileSystemError.FileNotFound(uri);
    }

    async writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): Promise<void> {
        const fileName = uri.path.substring(1);
        const newCommandContent = Buffer.from(content).toString('utf8');

        // Check if the command already exists
        const existingCommand = this._commands.get(fileName);

        if (!options.create && !existingCommand) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }
        if (existingCommand && options.create && !options.overwrite) {
            throw vscode.FileSystemError.FileExists(uri);
        }

        // Determine the command name based on the filename,
        // prioritizing the name if it's not an auto-generated one.
        let commandName: string | undefined = undefined;
        const namePart = fileName.endsWith('.cmd') ? fileName.substring(0, fileName.length - 4) : fileName;
        // If the filename looks like a user-provided name (not just a truncated command)
        if (!namePart.match(/^[a-zA-Z0-9_]{1,20}$/) && !newCommandContent.startsWith(namePart)) { // Simple check to avoid setting truncated command as name
             commandName = namePart;
        } else if (existingCommand?.name) { // Preserve existing explicit name
            commandName = existingCommand.name;
        }


        this._commands.set(fileName, { name: commandName, command: newCommandContent });
        await this.saveCommandsToGlobalState();
        this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
    }

    async delete(uri: vscode.Uri, options: { recursive: boolean; }): Promise<void> {
        const fileName = uri.path.substring(1);
        if (this._commands.has(fileName)) {
            this._commands.delete(fileName);
            await this.saveCommandsToGlobalState();
            this._emitter.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
        } else {
            throw vscode.FileSystemError.FileNotFound(uri);
        }
    }

    async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): Promise<void> {
        const oldFileName = oldUri.path.substring(1);
        const newFileName = newUri.path.substring(1);

        if (!this._commands.has(oldFileName)) {
            throw vscode.FileSystemError.FileNotFound(oldUri);
        }
        if (this._commands.has(newFileName) && !options.overwrite) {
            throw vscode.FileSystemError.FileExists(newUri);
        }

        const oldCommand = this._commands.get(oldFileName)!;
        let newCommandName: string | undefined = oldCommand.name; // Preserve old name by default

        // If the new file name implies a different name, update it.
        const newNamePart = newFileName.endsWith('.cmd') ? newFileName.substring(0, newFileName.length - 4) : newFileName;
        const oldNamePart = oldFileName.endsWith('.cmd') ? oldFileName.substring(0, oldFileName.length - 4) : oldFileName;

        if (newNamePart !== oldNamePart) {
            // Only update name if the new name part is clearly a user-defined name
            // (i.e., not just a truncated command string being implicitly used as filename)
            if (!newNamePart.match(/^[a-zA-Z0-9_]{1,20}$/) && !oldCommand.command.startsWith(newNamePart)) {
                 newCommandName = newNamePart; // Use the new file name as the command name
            } else if (newNamePart.trim() === '') { // If renamed to empty, remove name
                newCommandName = undefined;
            }
        }


        this._commands.delete(oldFileName);
        this._commands.set(newFileName, { name: newCommandName, command: oldCommand.command });

        await this.saveCommandsToGlobalState();
        this._emitter.fire([
            { type: vscode.FileChangeType.Deleted, uri: oldUri },
            { type: vscode.FileChangeType.Created, uri: newUri }
        ]);
    }

    createDirectory(uri: vscode.Uri): void | Thenable<void> {
        throw vscode.FileSystemError.NoPermissions('Directories not supported');
    }

    // Helper to add a command programmatically (e.g., from addCommand, importCommand)
    async addCommandItem(item: CommandItem): Promise<void> {
        let fileName = this.generateFileName(item);

        // Ensure unique filename if a duplicate exists
        let uniqueFileName = fileName;
        let counter = 1;
        while (this._commands.has(uniqueFileName)) {
            const baseName = item.name && item.name.trim() !== '' ? item.name : item.command.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '_');
            uniqueFileName = `${baseName}-${counter}.cmd`;
            counter++;
        }

        this._commands.set(uniqueFileName, item);
        await this.saveCommandsToGlobalState();
        this._emitter.fire([{ type: vscode.FileChangeType.Created, uri: vscode.Uri.parse(`${COMMAND_FILE_SCHEME}:/${uniqueFileName}`) }]);
    }

    // Helper to get command by filename (from TreeDataProvider)
    getCommandByFileName(fileName: string): CommandItem | undefined {
        return this._commands.get(fileName);
    }

    // Helper to get all commands for TreeDataProvider and export
    getAllCommandItems(): CommandItem[] {
        return Array.from(this._commands.values());
    }
}

export const commandFsScheme = COMMAND_FILE_SCHEME;