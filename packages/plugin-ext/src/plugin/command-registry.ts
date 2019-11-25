/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as theia from '@theia/plugin';
import * as model from '../common/plugin-api-rpc-model';
import { CommandRegistryExt, PLUGIN_RPC_CONTEXT as Ext, CommandRegistryMain } from '../common/plugin-api-rpc';
import { RPCProtocol } from '../common/rpc-protocol';
import { Disposable } from './types-impl';
import { DisposableCollection } from '@theia/core';
import { KnownCommands } from '../common/known-commands';

// tslint:disable-next-line:no-any
export type Handler = <T>(...args: any[]) => T | PromiseLike<T | undefined>;

export interface ArgumentProcessor {
    // tslint:disable-next-line:no-any
    processArgument(arg: any): any;
}

export class CommandRegistryImpl implements CommandRegistryExt {

    private proxy: CommandRegistryMain;
    private readonly commands = new Set<string>();
    private readonly handlers = new Map<string, Handler>();
    private readonly argumentProcessors: ArgumentProcessor[];
    private readonly commandsConverter: CommandsConverter;

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(Ext.COMMAND_REGISTRY_MAIN);
        this.argumentProcessors = [];
        this.commandsConverter = new CommandsConverter(this);
    }

    get converter(): CommandsConverter {
        return this.commandsConverter;
    }

    // tslint:disable-next-line:no-any
    registerCommand(command: theia.CommandDescription, handler?: Handler, thisArg?: any): Disposable {
        if (this.commands.has(command.id)) {
            throw new Error(`Command ${command.id} already exist`);
        }
        this.commands.add(command.id);
        this.proxy.$registerCommand(command);

        const toDispose: Disposable[] = [];
        if (handler) {
            toDispose.push(this.registerHandler(command.id, handler, thisArg));
        }
        toDispose.push(Disposable.create(() => {
            this.commands.delete(command.id);
            this.proxy.$unregisterCommand(command.id);
        }));
        return Disposable.from(...toDispose);
    }

    // tslint:disable-next-line:no-any
    registerHandler(commandId: string, handler: Handler, thisArg?: any): Disposable {
        if (this.handlers.has(commandId)) {
            throw new Error(`Command "${commandId}" already has handler`);
        }
        this.proxy.$registerHandler(commandId);
        // tslint:disable-next-line:no-any
        this.handlers.set(commandId, (...args: any[]) => handler.apply(thisArg, args));
        return Disposable.create(() => {
            this.handlers.delete(commandId);
            this.proxy.$unregisterHandler(commandId);
        });
    }

    dispose(): void {
        throw new Error('Method not implemented.');
    }

    // tslint:disable-next-line:no-any
    $executeCommand<T>(id: string, ...args: any[]): PromiseLike<T | undefined> {
        console.log('>>>>>>>>>>>>>>>>>>>>>>>>> $executeCommand');
        if (this.handlers.has(id)) {
            console.log('>>>>>>>>>>>>>>>>>>>>>>>>> call executeLocalCommand from $');
            return this.executeLocalCommand(id, ...args);
        } else {
            return Promise.reject(new Error(`Command: ${id} does not exist.`));
        }
    }

    // tslint:disable:no-any
    executeCommand<T>(id: string, ...args: any[]): PromiseLike<T | undefined> {
        args = args.map(arg => this.argumentProcessors.reduce((r, p) => p.processArgument(r), arg));
        console.log('>>>>>>>>>>>>>>>>>>>>>>>>> executeCommand id: ' + id + ', args: ' + JSON.stringify(args));
        if (this.handlers.has(id)) {
            console.log('>>>>>>>>>>>>>>>>>>>>>>>>> 1');
            return this.executeLocalCommand(id, ...args);
        } else if (KnownCommands.mapped(id)) {
            console.log('>>>>>>>>>>>>>>>>>>>>>>>>> 2');
            // Using the KnownCommand exclusions, convert the commands manually
            return KnownCommands.map(id, args, (mappedId: string, mappedArgs: any[] | undefined) =>
                this.proxy.$executeCommand(mappedId, ...mappedArgs));
        } else {
            console.log('>>>>>>>>>>>>>>>>>>>>>>>>> 3');
            return this.proxy.$executeCommand(id, ...args);
        }
    }
    // tslint:enable:no-any

    getKeyBinding(commandId: string): PromiseLike<theia.CommandKeyBinding[] | undefined> {
        return this.proxy.$getKeyBinding(commandId);
    }

    // tslint:disable-next-line:no-any
    private async executeLocalCommand<T>(id: string, ...args: any[]): Promise<T | undefined> {
        console.log('>>>>>>>>>>>>>>>>>>>>>>>>> executeLocalCommand id: ' + id + ', args: ' + JSON.stringify(args));
        const handler = this.handlers.get(id);
        if (handler) {
            console.log('>>>>>>>>>>>>>>>>>>>>>>>>> handler found');
            const processedArgs = args.map(arg => this.argumentProcessors.reduce((r, p) => p.processArgument(r), arg));
            console.log('>>>>>>>>>>>>>>>>>>>>>>>>> going to process arguments: ' + JSON.stringify(processedArgs));
            return handler<T>(...processedArgs);
        } else {
            throw new Error(`Command ${id} doesn't exist`);
        }
    }

    async getCommands(filterUnderscoreCommands: boolean = false): Promise<string[]> {
        const result = await this.proxy.$getCommands();
        if (filterUnderscoreCommands) {
            return result.filter(command => command[0] !== '_');
        }
        return result;
    }

    registerArgumentProcessor(processor: ArgumentProcessor): void {
        this.argumentProcessors.push(processor);
    }
}

// copied and modified from https://github.com/microsoft/vscode/blob/1.37.1/src/vs/workbench/api/common/extHostCommands.ts#L217-L259
export class CommandsConverter {

    private readonly safeCommandId: string;
    private readonly commands: CommandRegistryImpl;
    private readonly commandsMap = new Map<number, theia.Command>();
    private handle = 0;
    private isSafeCommandRegistered: boolean;

    constructor(commands: CommandRegistryImpl) {
        this.safeCommandId = `theia_safe_cmd_${Date.now().toString()}`;
        this.commands = commands;
        this.isSafeCommandRegistered = false;
    }

    /**
     * Convert to a command that can be safely passed over JSON-RPC.
     */
    toSafeCommand(command: undefined, disposables: DisposableCollection): undefined;
    toSafeCommand(command: theia.Command, disposables: DisposableCollection): model.Command;
    toSafeCommand(command: theia.Command | undefined, disposables: DisposableCollection): model.Command | undefined;
    toSafeCommand(command: theia.Command | undefined, disposables: DisposableCollection): model.Command | undefined {
        if (!command) {
            return undefined;
        }
        const result = this.toInternalCommand(command);
        if (KnownCommands.mapped(result.id)) {
            return result;
        }

        if (!this.isSafeCommandRegistered) {
            this.commands.registerCommand({ id: this.safeCommandId }, this.executeSafeCommand, this);
            this.isSafeCommandRegistered = true;
        }

        if (command.command && command.arguments && command.arguments.length > 0) {
            const id = this.handle++;
            this.commandsMap.set(id, command);
            disposables.push(new Disposable(() => this.commandsMap.delete(id)));
            result.id = this.safeCommandId;
            result.arguments = [id];
        }

        return result;
    }

    protected toInternalCommand(external: theia.Command): model.Command {
        // we're deprecating Command.id, so it has to be optional.
        // Existing code will have compiled against a non - optional version of the field, so asserting it to exist is ok
        // tslint:disable-next-line: no-any
        return KnownCommands.map((external.command || external.id)!, external.arguments, (mappedId: string, mappedArgs: any[]) =>
            ({
                id: mappedId,
                title: external.title || external.label || ' ',
                tooltip: external.tooltip,
                arguments: mappedArgs
            }));
    }

    // tslint:disable-next-line:no-any
    private executeSafeCommand<R>(...args: any[]): PromiseLike<R | undefined> {
        const command = this.commandsMap.get(args[0]);
        if (!command || !command.command) {
            return Promise.reject('command NOT FOUND');
        }
        return this.commands.executeCommand(command.command, ...(command.arguments || []));
    }

}
