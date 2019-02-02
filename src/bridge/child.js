/* @flow */

import { ZalgoPromise } from 'zalgo-promise/src';
import { isSameDomain, getOpener, getDomain, getFrameByName, type CrossDomainWindowType } from 'cross-domain-utils/src';
import { noop } from 'belter/src';

import { getGlobal, windowStore } from '../global';
import type { OnType, SendType, ReceiveMessageType } from '../types';

import { needsBridge, registerRemoteWindow, rejectRemoteSendMessage, registerRemoteSendMessage, getBridgeName } from './common';

function awaitRemoteBridgeForWindow (win : CrossDomainWindowType) : ZalgoPromise<?CrossDomainWindowType> {
    return windowStore('remoteBridgeAwaiters').getOrSet(win, () => {
        return ZalgoPromise.try(() => {
            const frame = getFrameByName(win, getBridgeName(getDomain()));

            if (!frame) {
                throw new Error(`Bridge not found for domain: ${ getDomain() }`);
            }

            // $FlowFixMe
            if (isSameDomain(frame) && getGlobal(frame)) {
                return frame;
            }

            return new ZalgoPromise((resolve, reject) => {

                let interval;
                let timeout; // eslint-disable-line prefer-const

                interval = setInterval(() => { // eslint-disable-line prefer-const
                    // $FlowFixMe
                    if (frame && isSameDomain(frame) && getGlobal(frame)) {
                        clearInterval(interval);
                        clearTimeout(timeout);
                        return resolve(frame);
                    }
                }, 100);

                timeout = setTimeout(() => {
                    clearInterval(interval);
                    return reject(new Error(`Bridge not found for domain: ${ getDomain() }`));
                }, 2000);
            });
        });
    });
}

export function openTunnelToOpener({ on, send, receiveMessage } : { on : OnType, send : SendType, receiveMessage : ReceiveMessageType }) : ZalgoPromise<void> {
    return ZalgoPromise.try(() => {
        const opener = getOpener(window);

        if (!opener) {
            return;
        }

        if (!needsBridge({ win: opener })) {
            return;
        }

        registerRemoteWindow(opener);

        return awaitRemoteBridgeForWindow(opener).then(bridge => {

            if (!window.name) {
                return rejectRemoteSendMessage(opener, new Error(`Can not register with opener: window does not have a name`));
            }

            // $FlowFixMe
            return getGlobal(bridge).openTunnelToParent({

                name: window.name,

                source: window,

                canary() {
                    // pass
                },

                sendMessage(message) {

                    try {
                        noop(window);
                    } catch (err) {
                        return;
                    }

                    if (!window || window.closed) {
                        return;
                    }

                    try {
                        receiveMessage({
                            data:   message,
                            origin: this.origin,
                            source: this.source
                        }, { on, send });
                    } catch (err) {
                        ZalgoPromise.reject(err);
                    }
                }

            }).then(({ source, origin, data }) => {

                if (source !== opener) {
                    throw new Error(`Source does not match opener`);
                }

                registerRemoteSendMessage(source, origin, data.sendMessage);

            }).catch(err => {

                rejectRemoteSendMessage(opener, err);
                throw err;
            });
        });
    });
}
