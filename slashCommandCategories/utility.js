const { SlashCommandBuilder, InteractionContextType, MessageFlags, PermissionFlagsBits } = require('discord.js');
const tmp = require('tmp');
const fs = require('fs');
const { dbExecute, replyError, verifyModeratorRole } = require('../lib');

module.exports = {
  category: 'Utility Commands',
  commands: [
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('save-log')
        .setDescription('Save a log of recent channel messages to a text file.')
        .addIntegerOption((opt) => opt
          .setName('limit')
          .setDescription('Number of messages to save. Min 1, max 1000, default 100')
          .setRequired(false))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      async execute(interaction) {
        const limit = interaction.options.getInteger('limit') ?? 100;

        // Control variables
        const logs = [];
        let lastMessageId = interaction.id;

        // Do not fetch more than 1000 messages from the Discord API
        if (limit < 1 || limit > 1000) {
          return interaction.reply({
            content: 'Limit argument must be an integer from 1 to 1000.',
            flags: MessageFlags.Ephemeral,
          });
        }

        try {
          // This might take a few seconds
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          while (logs.length < limit) {
            // Determine number of messages to be fetched this request
            const fetchLimit = ((limit - logs.length) > 100) ? 100 : (limit - logs.length);

            // Fetch messages from Discord API
            const messages = await interaction.channel.messages.fetch({
              before: lastMessageId,
              limit: fetchLimit,
            });

            // Save relevant message data
            messages.each((msg) => {
              logs.push({
                id: msg.id,
                user: `${msg?.member?.displayName || msg.author.username}`,
                timestamp: msg.createdTimestamp,
                content: msg.content,
              });
            });

            // Begin fetching from the earliest message
            lastMessageId = logs[logs.length - 1].id;

            // If no more messages are available, stop fetching
            if (messages.size < fetchLimit) { break; }
          }

          // Reverse the array so the oldest messages occur first, and will therefore be printed earlier
          // in the output file
          logs.reverse();

          // Build output file
          let output = '';
          logs.forEach((log) => {
            output += `${log.user} (${new Date(log.timestamp).toUTCString()}):\n${log.content}\n\n`;
          });

          // Save the output to a temporary file and send it to the channel
          return tmp.file((err, tmpFilePath, fd, cleanupCallback) => {
            fs.writeFile(tmpFilePath, output, () => {
              // The followUp here seems to sometimes give an 'Unknown Message' error on the interaction
              // response itself, particularly when it takes longer. Not really sure why.
              return interaction.followUp({
                content: `Saved a log of the previous ${limit} messages in this channel.`,
                files: [
                  {
                    name: `${interaction.channel.name}-log.txt`,
                    attachment: tmpFilePath,
                  }
                ],
                flags: MessageFlags.Ephemeral,
              });
            });
          });
        } catch (e) {
          console.error(e);
          return interaction.followUp(replyError('Something went wrong and the channel logs could not be saved.\n'));
        }
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('purge-thread')
        .setDescription('Remove all members (except mods) from the current thread who are inactive.')
        .addIntegerOption((opt) => opt
          .setName('days')
          .setDescription('Number of days of inactivity for cutoff. Min 1, default 60')
          .setRequired(false))
        .addBooleanOption((opt) => opt
          .setName('dry-run')
          .setDescription('Run a test to see how many users would be removed without actually removing them')
          .setRequired(false))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      async execute(interaction) {
        const days = interaction.options.getInteger('days') ?? 60;
        const doPurge = !interaction.options.getBoolean('dry-run');

        if (days < 1) {
          return interaction.reply({
            content: 'Invalid activity cutoff.',
            flags: MessageFlags.Ephemeral,
          });
        }

        if (!interaction.channel.isThread()) {
          return interaction.reply({
            content: 'Cannot purge non-thread channel.',
            flags: MessageFlags.Ephemeral,
          });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        console.info('Running purge...');

        let totalPurgedMembers = 0;

        try {
          const targetDate = Math.floor(new Date().getTime() - (days * 24 * 60 * 60 * 1000));
          console.info(`\nFetching messages since ${new Date(targetDate).toISOString()}`);
          const messages = await fetchMessagesSince(interaction.channel, targetDate);
          console.info(`Found ${messages.length} messages total`);

          // Fetch full user list for thread
          console.info('\nFetching thread members');
          const threadMembers = await fetchThreadMembers(interaction.channel);
          console.debug(`Found ${threadMembers.length} members`);

          // Identify unique active thread members
          const activeUsers = new Set();
          messages.forEach((msg) => {
            activeUsers.add(msg.author.id);
          });
          console.debug(`\n${activeUsers.size} unique users have sent messages in given period`);

          // Remove thread members who have not sent a message in specified time
          console.info('Purging inactive members...');
          for (let member of threadMembers) {
            const isMod = await verifyModeratorRole(member.guildMember);

            if (!(activeUsers.has(member.id) || isMod || member.user.bot)) {
              console.info(`Removing ${member.user.username}`);
              totalPurgedMembers++;
              if (doPurge) {
                await interaction.channel.members.remove(member.id);
                await new Promise((resolve) => setTimeout(resolve, 600));
              }
            }
          }
        } catch (e) {
          console.error(e);
          return interaction.followUp(replyError('Something went wrong and the thread could not be purged.\n'));
        }

        console.info(`Purged ${totalPurgedMembers} users`);
        return interaction.followUp(`Purged ${totalPurgedMembers} users`);
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('set-moderator-role')
        .setDescription('Assign a new role to use as the Moderator role when determining moderator actions.')
        .addRoleOption((opt) => opt
          .setName('role')
          .setDescription('New moderator role')
          .setRequired(true))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(0),
      async execute(interaction) {
        const role = interaction.options.getRole('role', true);
        await dbExecute('UPDATE guild_data SET moderatorRoleId=? WHERE guildId=?', [role.id, interaction.guildId]);
        return interaction.reply({
          content: `Moderator role updated to ${role}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    },
  ],
};

// Subroutines copied over from purge script
const fetchMessagesSince = async (threadChannel, oldestTimestamp, limit=100, messageCache=[]) => {
  // Fetch messages prior to the oldest (first) message in the cache
  const messages = await threadChannel.messages.fetch({
    limit: limit,
    before: messageCache[0]?.id || null,
  });

  // Prepend newly fetched messages to the front of a working array
  const msgArray = [];
  const foundMessages = messages.map((m) => m).reverse();
  for (let msg of foundMessages) {
    if (msg.createdTimestamp >= oldestTimestamp) {
      msgArray.push(msg);
    }
  }
  msgArray.push(...messageCache);

  // If no more messages are available, return what was found
  if (foundMessages.length < limit) {
    // Return messages
    return msgArray;
  }

  // Wait half a second to prevent rate-limiting
  await new Promise((resolve) => setTimeout(resolve, 600));

  // Fetch more messages if the desired timestamp has not been reached
  if (foundMessages[0].createdTimestamp >= oldestTimestamp) {
    console.info(`\n${new Date(msgArray[0].createdTimestamp).toISOString()}`);
    console.info(`Message count: ${msgArray.length}`);
    return await fetchMessagesSince(threadChannel, oldestTimestamp, limit, msgArray);
  }

  // Return messages
  return msgArray;
};

const fetchThreadMembers = async (threadChannel, limit=100, userCache=[]) => {
  const members = await threadChannel.members.fetch({
    limit,
    after: userCache[userCache.length-1]?.id || null,
    withMember: true,
  });

  const userArray = [...userCache];
  members.each((member) => {
    if (!member.bot) {
      userArray.push(member);
    }
  });

  if (members.size < limit) {
    return userArray;
  }

  console.info(`User count: ${userArray.length}`);
  return await fetchThreadMembers(threadChannel, limit, userArray);
};
