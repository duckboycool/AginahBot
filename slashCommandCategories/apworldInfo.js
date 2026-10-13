const { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits, MessageFlags, EmbedBuilder,
  escapeMarkdown } = require('discord.js');
const { dbExecute, dbQueryAll, dbQueryOne, verifyModRole } = require('../lib');

const autocomplete_world = async (interaction) => {
  const curValue = interaction.options.getString('world', true);
  if (!curValue) {
    return interaction.respond([]);
  }

  // Probably a better way to perform this search
  const sql = `SELECT DISTINCT worldName FROM apworld_info info
    LEFT JOIN apworld_aliases aliases ON info.id=aliases.worldId
    WHERE worldName LIKE CONCAT('%', ?, '%') OR alias LIKE CONCAT('%', ?, '%') LIMIT 25`;
  const escapedVal = curValue.replaceAll(/([%_[])/g, '[$1]');
  const matches = await dbQueryAll(sql, [escapedVal, escapedVal]);

  return interaction.respond(matches.map((world) => ({ name: world.worldName, value: world.worldName })));
};

module.exports = {
  category: 'APWorld Info Commands',
  commands: [
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('apworld-info')
        .setDescription('Show the channel and link to releases for an APWorld in #apworld-index.')
        .addStringOption((opt) => opt
          .setName('world')
          .setDescription('Name of world')
          .setRequired(true)
          .setAutocomplete(true))
        .setContexts(InteractionContextType.Guild),
      async execute(interaction) {
        const search = interaction.options.getString('world', true);
        const match = await dbQueryOne('SELECT * FROM apworld_info WHERE worldName=?', [search]);

        if (!match) {
          return interaction.reply({
            content: `Could not find world \`${search.replaceAll('`', '')}\` in playable list.`,
          });
        }

        const embed = new EmbedBuilder()
          .setTitle(`${escapeMarkdown(match.worldName)} info`)
          .setColor('#e67e22')
          .setTimestamp(new Date())
          .addFields({ name: 'World Channel', value: `<#${match.channelId}>` });
        
        if (/^https?:\/\//.test(match.releaseLink)) {
          embed.addFields({ name: 'Release Link', value: match.releaseLink });
        } else {
          embed.addFields({ name: 'Release Info', value: `*${escapeMarkdown(match.releaseLink)}*` });
        }

        return interaction.reply({
          embeds: [embed],
        });
      },
      autocomplete: autocomplete_world
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('apworld-info-add')
        .setDescription('Add or edit an entry in the APWorld info list.')
        .addStringOption((opt) => opt
          .setName('world')
          .setDescription('Name of world')
          .setRequired(true)
          .setAutocomplete(true))
        .addChannelOption((opt) => opt
          .setName('channel')
          .setDescription('Channel/thread for the world')
          .setRequired(false))
        .addStringOption((opt) => opt
          .setName('release')
          .setDescription('Link to the world\'s release, or text describing why one is unavailable')
          .setRequired(false))
        .addStringOption((opt) => opt
          .setName('channel-id')
          .setDescription('Direct id input for channel, needed for channel outside current server')
          .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setContexts(InteractionContextType.Guild),
      async execute(interaction) {
        if (!await verifyModRole(interaction.member)) {
          return interaction.reply({
            content: 'Only moderators can edit world info entries.',
            flags: MessageFlags.Ephemeral,
          })
        }

        const newName = interaction.options.getString('world', true);
        let channelId = interaction.options.getChannel('channel')?.id;
        if (!channelId) {
          const idInput = interaction.options.getString('channel-id');
          if (/^\d+$/.test(idInput)) channelId = idInput;
        }
        let releaseLink = interaction.options.getString('release');

        const match = await dbQueryOne('SELECT * FROM apworld_info WHERE worldName=?', [newName]);

        if (match) {
          if (!channelId) channelId = match.channelId;
          if (!releaseLink) releaseLink = match.releaseLink;

          const sql = 'UPDATE apworld_info SET worldName=?, releaseLink=?, channelId=? WHERE id=?';
          dbExecute(sql, [newName, releaseLink, channelId, match.id]);

          return interaction.reply({
            content: `Edited \`${newName.replaceAll('`', '')}\` world entry.`,
            flags: MessageFlags.Ephemeral,
          });
        } else {
          if (!channelId || !releaseLink) {
            return interaction.reply({
              content: 'Must set channel and release when adding a new world that\'s already present.',
              flags: MessageFlags.Ephemeral,
            });
          }

          const sql = 'INSERT INTO apworld_info (worldName, releaseLink, channelId) VALUES (?, ?, ?)';
          dbExecute(sql, [newName, releaseLink, channelId]);

          return interaction.reply({
            content: `Added new world entry for \`${newName.replaceAll('`', '')}\`.`,
            flags: MessageFlags.Ephemeral,
          });
        }
      },
      autocomplete: autocomplete_world
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('apworld-info-remove')
        .setDescription('Delete an entry in the APWorld info list.')
        .addStringOption((opt) => opt
          .setName('world')
          .setDescription('Name of world')
          .setRequired(true)
          .setAutocomplete(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setContexts(InteractionContextType.Guild),
      async execute(interaction) {
        if (!await verifyModRole(interaction.member)) {
          return interaction.reply({
            content: 'Only moderators can delete world info entries.',
            flags: MessageFlags.Ephemeral,
          })
        }

        const worldName = interaction.options.getString('world', true);

        const match = await dbQueryOne('SELECT * FROM apworld_info WHERE worldName=?', [worldName]);

        if (match) {
          dbExecute('DELETE FROM apworld_info WHERE id=?', [match.id]);
          dbExecute('DELETE FROM apworld_aliases WHERE worldId=?', [match.id]);

          return interaction.reply({
            content: `Deleted \`${worldName.replaceAll('`', '')}\` world entry.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        return interaction.reply({
          content: `Did not find world entry for \`${worldName.replaceAll('`', '')}\`.`,
          flags: MessageFlags.Ephemeral,
        });
      },
      autocomplete: autocomplete_world
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('apworld-info-alias')
        .setDescription('Add an alias for a world in the APWorld info list.')
        .addStringOption((opt) => opt
          .setName('world')
          .setDescription('Name of world')
          .setRequired(true)
          .setAutocomplete(true))
        .addStringOption((opt) => opt
          .setName('alias')
          .setDescription('Alias for the world. Like world names, searches match by any substring')
          .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setContexts(InteractionContextType.Guild),
      async execute(interaction) {
        if (!await verifyModRole(interaction.member)) {
          return interaction.reply({
            content: 'Only moderators can change world aliases.',
            flags: MessageFlags.Ephemeral,
          })
        }

        const worldName = interaction.options.getString('world', true);
        const alias = interaction.options.getString('alias', true);

        const match = await dbQueryOne('SELECT * FROM apworld_info WHERE worldName=?', [worldName]);

        if (match) {
          dbExecute('INSERT INTO apworld_aliases (worldId, alias) VALUES (?, ?)', [match.id, alias]);

          return interaction.reply({
            content: `Added alias \`${alias.replaceAll('`', '')}\` to world entry \`${worldName.replaceAll('`', '')}\`.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        return interaction.reply({
          content: `Did not find world entry for \`${worldName.replaceAll('`', '')}\`.`,
          flags: MessageFlags.Ephemeral,
        });
      },
      autocomplete: autocomplete_world
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('apworld-info-unalias')
        .setDescription('Remove an alias for a world in the APWorld info list.')
        .addStringOption((opt) => opt
          .setName('world')
          .setDescription('Name of world')
          .setRequired(true)
          .setAutocomplete(true))
        .addStringOption((opt) => opt
          .setName('alias')
          .setDescription('Alias to remove for the world')
          .setRequired(true)
          .setAutocomplete(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setContexts(InteractionContextType.Guild),
      async execute(interaction) {
        if (!await verifyModRole(interaction.member)) {
          return interaction.reply({
            content: 'Only moderators can change world aliases.',
            flags: MessageFlags.Ephemeral,
          })
        }

        const worldName = interaction.options.getString('world', true);
        const alias = interaction.options.getString('alias', true);

        const match = await dbQueryOne('SELECT * FROM apworld_info WHERE worldName=?', [worldName]);
        if (!match) {
          return interaction.reply({
            content: `Did not find world entry for \`${worldName.replaceAll('`', '')}\`.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        const sql = 'SELECT * FROM apworld_aliases WHERE worldId=? AND alias=?';
        const aliasMatch = await dbQueryOne(sql, [match.id, alias]);

        if (!aliasMatch) {
          return interaction.reply({
            content: `Did not find alias \`${alias.replaceAll('`', '')}\` for \`${worldName.replaceAll('`', '')}\`.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        dbExecute('DELETE FROM apworld_aliases WHERE id=?', [aliasMatch.id]);

        return interaction.reply({
          content: `Removed alias \`${alias.replaceAll('`', '')}\` from world entry \`${worldName.replaceAll('`', '')}\`.`,
          flags: MessageFlags.Ephemeral,
        });
      },
      async autocomplete(interaction) {
        const field = interaction.options.getFocused(true);
        if (field.name === 'world') {
          return autocomplete_world(interaction);
        }

        const worldName = interaction.options.getString('world');
        if (!worldName || field.name !== 'alias') {
          return interaction.respond([]);
        }
        const match = await dbQueryOne('SELECT * FROM apworld_info WHERE worldName=?', [worldName]);
        if (!match) {
          return interaction.respond([]);
        }

        const sql = `SELECT alias FROM apworld_aliases WHERE worldId=? AND alias LIKE CONCAT('%', ?, '%') LIMIT 25`;
        const escapedVal = field.value.replaceAll(/([%_[])/g, '[$1]');

        const matches = await dbQueryAll(sql, [match.id, escapedVal]);
        return interaction.respond(matches.map((match) => ({ name: match.alias, value: match.alias })));
      },
    },
  ]
}
