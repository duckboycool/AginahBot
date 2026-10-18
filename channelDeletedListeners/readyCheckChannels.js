const { Client, GuildChannel } = require('discord.js');
const { dbQueryOne, dbExecute } = require('../lib.js');

/**
 * If a channel is deleted and a ready system was in effect in that channel, delete the ready system
 * @param {Client} client
 * @param {GuildChannel} channel
 * @returns {Promise<void>}
 */
module.exports = async (client, channel) => {
  const readySystem = await dbQueryOne('SELECT id FROM ready_systems WHERE channelId=?', [channel.id]);
  if (readySystem) {
    await dbExecute('DELETE FROM ready_checks WHERE readySystemId=?', [readySystem.id]);
    await dbExecute('DELETE FROM ready_systems WHERE id=?', [readySystem.id]);
  }
};
