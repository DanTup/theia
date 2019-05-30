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

import { interfaces, ContainerModule } from 'inversify';
import { ConnectionHandler, JsonRpcConnectionHandler } from '@theia/core/lib/common/messaging';
import { OutputChannelServiceImpl } from './output-channel-service-impl';
import { OutputChannelClient, OutputChannelService, outputChannelServicePath } from '../common/output-protocol';

export default new ContainerModule((bind: interfaces.Bind, unbind: interfaces.Unbind, isBound: interfaces.IsBound, rebind: interfaces.Rebind) => {
    bind(OutputChannelServiceImpl).toSelf().inSingletonScope();
    bind(OutputChannelService).toDynamicValue(ctx => {
        const server = ctx.container.get(OutputChannelServiceImpl);
        return server;
    }).inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<OutputChannelClient>(outputChannelServicePath, client => {
            const server = ctx.container.get<OutputChannelServiceImpl>(OutputChannelService);
            server.setClient(client);
            return server;
        })
    ).inSingletonScope();
});
