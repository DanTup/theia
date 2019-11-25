/********************************************************************************
 * Copyright (C) 2019 Arm and others.
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

import { injectable } from 'inversify';
import { OutputChannelClient, OutputChannelService } from '../common/output-protocol';

export interface LogOutputChannel {
    appendLine(line: string): void;
}

interface ChannelData {
    group: string;
    lines: string[];
    visible: boolean;
}

@injectable()
export class OutputChannelServiceImpl implements OutputChannelService {
    protected static LINES_TO_KEEP = 5000;
    protected static REMOVAL_SIZE = 100;

    private client: OutputChannelClient | undefined;

    private channels: Map<string, ChannelData> = new Map();

    async getChannels(): Promise<{ name: string, group: string }[]> {
        return Array.from(this.channels.entries()).map(([key, value]) =>
            ({ name: key, group: value.group })
        );
    }

    getChannel(channelName: string, group: string = 'default'): LogOutputChannel {
        const outer = this;
        return {
            appendLine(line: string): void {
                outer.log(line, channelName, group);
            }
        };
    }

    async requestToSendContent(channelName: string): Promise<void> {
        if (!this.client) {
            throw new Error('request received but client not set');
        }

        const data = this.channels.get(channelName);
        if (data) {
            const linesToReturn = data.lines;
            data.lines = [];

            linesToReturn.forEach(line => {
                if (!this.client) {
                    throw new Error('request received but client not set');
                }
                this.client.onProcessOutput(line, channelName);
            });

            data.visible = true;
        }
    }

    log(line: string, channelName: string, group: string): void {
        let data = this.channels.get(channelName);
        if (!data) {
            data = { group, lines: [], visible: false };
            this.channels.set(channelName, data);
            if (this.client) {
                this.client.onChannelAdded(channelName, data.group);
            }
        }

        if (this.client && data.visible) {
            this.client.onProcessOutput(line, channelName);
        } else {
            // No client connected yet so store on the backend
            data.lines.push(line);
            if (data.lines.length > OutputChannelServiceImpl.LINES_TO_KEEP + OutputChannelServiceImpl.REMOVAL_SIZE) {
                data.lines = data.lines.slice(OutputChannelServiceImpl.REMOVAL_SIZE);
            }
        }
    }

    setClient(client: OutputChannelClient | undefined): void {
        this.client = client;
    }

    getClient = (): OutputChannelClient => {
        if (this.client !== undefined) {
            return this.client;
        } else {
            throw new Error('Client for OutputChannelService has not been set.');
        }
    }

    dispose(): void {
        // Nothing to dispose
    }

}
