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

import { JsonRpcServer } from '@theia/core';

export const OutputChannelService = Symbol('OutputChannelService');
export const outputChannelServicePath = '/services/outputChannelService';

/**
 * Interface that defines the functions the backend output channel server implements that can be invoked by the client/UI side.
 */
export interface OutputChannelService extends JsonRpcServer<OutputChannelClient> {
    getChannels(): Promise<{ name: string, group: string }[]>;
    requestToSendContent(channelName: string): Promise<void>;
}

export const OutputChannelClient = Symbol('OutputChannelClient');
export const outputChannelClientPath = '/services/outputChannelClient';

/**
 * Interface describing the functions that the backend output channel server can call on the frontend client.
 */
export interface OutputChannelClient {
    onChannelAdded(channelName: string, group: string): void;
    onChannelDeleted(channelName: string): void;
    onProcessOutput(line: string, channelName: string): void;
}
