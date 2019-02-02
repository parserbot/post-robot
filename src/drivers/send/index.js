/* @flow */

import { isWindowClosed, type CrossDomainWindowType, type DomainMatcher } from 'cross-domain-utils/src';
import { uniqueID } from 'belter/src';

import { __POST_ROBOT__ } from '../../conf';
import { serializeMessage } from '../../serialize';
import type { Message } from '../types';
import type { OnType, SendType } from '../../types';

import { SEND_MESSAGE_STRATEGIES } from './strategies';

export function sendMessage(win : CrossDomainWindowType, domain : DomainMatcher, message : Message, { on, send } : { on : OnType, send : SendType }) {
    if (isWindowClosed(win)) {
        throw new Error('Window is closed');
    }
    
    const serializedMessage = serializeMessage(win, domain, {
        [ __POST_ROBOT__ ]: {
            id: uniqueID(),
            ...message
        }
    }, { on, send });

    let success = false;
    let error;

    for (const strategyName of Object.keys(SEND_MESSAGE_STRATEGIES)) {
        try {
            SEND_MESSAGE_STRATEGIES[strategyName](win, serializedMessage, domain);
            success = true;
        } catch (err) {
            error = error || err;
        }
    }

    if (!success) {
        throw error;
    }
}
