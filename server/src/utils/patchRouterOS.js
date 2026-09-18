/**
 * Patch node-routeros to gracefully handle RouterOS v7 '!empty' replies
 * and ignore stray packets on UNREGISTEREDTAG (closed/timed out tags).
 */
function patchRouterOS() {
    // 1. Patch Channel for RouterOS v7 '!empty' replies
    try {
        const { Channel } = require('node-routeros/dist/Channel');
        if (Channel && Channel.prototype && !Channel.prototype._patchedForEmpty) {
            Channel.prototype._patchedForEmpty = true;

            const originalProcessPacket = Channel.prototype.processPacket;
            Channel.prototype.processPacket = function (packet) {
                if (Array.isArray(packet) && packet[0] === '!empty') {
                    packet[0] = '!done';
                }
                return originalProcessPacket.call(this, packet);
            };

            const originalOnUnknown = Channel.prototype.onUnknown;
            Channel.prototype.onUnknown = function (reply) {
                if (reply === '!empty') {
                    if (!this.trapped) {
                        this.emit('done', this.data);
                    }
                    this.close();
                    return;
                }
                return originalOnUnknown.call(this, reply);
            };
        }
    } catch (err) {
        console.warn('[RouterOS Patch Warning]: Could not apply RouterOS v7 !empty patch:', err.message);
    }

    // 2. Patch Receiver to suppress UNREGISTEREDTAG exceptions on late/stray socket packets
    try {
        const { Receiver } = require('node-routeros/dist/connector/Receiver');
        if (Receiver && Receiver.prototype && !Receiver.prototype._patchedForUnregisteredTag) {
            Receiver.prototype._patchedForUnregisteredTag = true;

            Receiver.prototype.sendTagData = function (currentTag) {
                const tag = this.tags.get(currentTag);
                if (tag) {
                    tag.callback(this.currentPacket);
                } else {
                    // Silently ignore stray response packets for closed/timed out tags
                }
                this.cleanUp();
            };
        }
    } catch (err) {
        console.warn('[RouterOS Patch Warning]: Could not apply Receiver UNREGISTEREDTAG patch:', err.message);
    }
}

patchRouterOS();

module.exports = { patchRouterOS };
