const { dbQueryOne, dbExecute } = require('../lib');

module.exports = async (client, oldState, newState) => {
  // If the user changed their voice state but remained in the same channel, do nothing (mute, deafen, etc.)
  if (oldState.channel && newState.channel && oldState.channel.id === newState.channel.id) { return; }

  // User entered a voice channel
  if (newState?.channel?.id && newState?.member?.voice?.channelId) {
    // Find ready system
    const readySystem = await dbQueryOne(
      'SELECT rs.id FROM ready_systems rs JOIN guild_data gd ON gd.id=rs.guildDataId WHERE guildId=? AND channelId=?',
      [newState.guild.id, newState.channel.id]
    );

    if (!readySystem) {
      return;
    }

    const alreadyJoined = await dbQueryOne(
      'SELECT 1 FROM ready_checks WHERE readySystemId=? AND userId=?',
      [readySystem.id, newState.member.id]
    );

    if (!alreadyJoined) {
      await dbExecute(
        'REPLACE INTO ready_checks (readySystemId, userId, isReady) VALUES (?, ?, 0)',
        [readySystem.id, newState.member.id]
      );

      await newState.channel.send({
        content: `${newState.member} has joined the game. Use \`/ready-leave\` if you do not intend to participate.`,
        allowedMentions: {},
      });
    }
  }

  // User left a voice channel
  if (oldState?.channel?.id) {
    // Find ready system
    const readySystem = await dbQueryOne(
      'SELECT rs.id FROM ready_systems rs JOIN guild_data gd ON gd.id=rs.guildDataId WHERE guildId=? AND channelId=?',
      [oldState.guild.id, oldState.channel.id]
    );

    if (!readySystem) {
      return;
    }

    const wasJoined = await dbQueryOne(
      'SELECT 1 FROM ready_checks WHERE readySystemId=? AND userId=?',
      [readySystem.id, oldState.member.id]
    );

    if (wasJoined) {
      await dbExecute(
        'DELETE FROM ready_checks WHERE readySystemId=? AND userId=?',
        [readySystem.id, oldState.member.id]
      );

      try{
        await oldState.channel.send({
          content: `${oldState.member} has left the game.`,
          allowedMentions: {},
        });
      } catch (err) {
        console.error('Unable to send message to voice channel.');
        console.error(err);
      }
    }
  }
};
