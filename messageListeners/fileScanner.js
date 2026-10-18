const { generalErrorHandler } = require('../errorHandlers');
const { PermissionFlagsBits } = require('discord.js');
const { dbQueryOne, verifyChannelPermissions, getLeadModRole, getModRole } = require('../lib');

const romFileExtensions = [
  // General ROM File Extensions
  // 'bin',  // Generic binary ROM file
  'rom',  // Generic ROM image file
  'iso',  // CD/DVD disc image (used for disc-based consoles like PS1, PS2)
  'img',  // Disk image file
  'cue',  // Cue sheet file (used with bin or iso files)

  // NES (Nintendo Entertainment System)
  'nes', 'unf', 'fds',

  // SNES (Super Nintendo Entertainment System)
  'smc', 'sfc', 'fig', 'swc',

  // Nintendo 64
  'z64', 'n64', 'v64',

  // Game Boy / Game Boy Color
  'gb', 'gbc', 'cgb',

  // Game Boy Advance
  'gba',

  // Nintendo DS
  'nds', 'dsi',

  // Nintendo 3DS
  '3ds', 'cci', 'cxi', 'app',

  // Nintendo Switch
  'xci', 'nsp', 'ncz',

  // Sega Genesis / Mega Drive
  // 'smd', 'gen', 'md',
  'smd', 'gen',

  // Sega Master System
  'sms',

  // Sega Saturn
  'iso', 'cue',

  // Sega Dreamcast
  'cdi', 'gdi', 'chd',

  // Game Gear
  'gg',

  // PlayStation 1 (PSX/PS1)
  'pbp', 'z',

  // PlayStation 2 (PS2)
  'nrg',

  // PlayStation Portable (PSP)
  'cso',

  // PlayStation 3 (PS3)
  // 'pkg',

  // PlayStation 4 (PS4)
  // 'pkg',

  // Xbox
  'xbe',

  // Xbox 360
  'xex', 'god',

  // Xbox One
  'xvd',

  // MS-DOS
  'ima', 'dos',

  // Windows Games
  // 'exe',

  // Commodore 64
  'd64', 't64', 'prg', 'tap', 'crt',

  // MAME (Multiple Arcade Machine Emulator)
  // 'zip', 'chd', '7z',
  'chd',

  // Neo Geo
  'neo',

  // Atari Consoles
  // Atari 2600
  'a26',

  // Atari 5200
  'a52',

  // Atari 7800
  'a78',

  // Atari Jaguar
  'j64', 'jag',

  // Atari Lynx
  'lnx',

  // Atari ST
  'st', 'stx', 'msa',

  // Amiga
  'adf', 'adz', 'dms', 'ipf',

  // ColecoVision
  'col',

  // Intellivision
  'int',

  // TurboGrafx-16 / PC Engine
  'pce', 'tg16',

  // WonderSwan
  'ws', 'wsc',

  // Neo Geo Pocket
  'ngp', 'ngc'
];

const isRomFile = (filename) => {
  const fileExtension = filename.split('.').pop().toLowerCase();
  return romFileExtensions.includes(fileExtension);
};

module.exports = async (client, message) => {
  try {
    const manageMessages = verifyChannelPermissions(message.channel, [PermissionFlagsBits.ManageMessages]);
    if (!manageMessages.ok) {
      console.warn(`ManageMessages permission is missing in guild ${message.guild.name} (${message.guild.id}) / ` +
          `channel ${message.channel.name} (${message.channel.id}).`);
      return;
    }

    const moderator = await getModRole(message.guild) ?? await getLeadModRole(message.guild);

    const sql = `SELECT go.alertsChannelId
                 FROM guild_options go
                 JOIN guild_data gd ON go.guildDataId = gd.id
                 WHERE gd.guildId=?`;
    const options = await dbQueryOne(sql, [message.guild.id]);

    const romFileNames = [];
    message.attachments.each((attachment) => {
      // Disallow direct posting of ROM files
      if (isRomFile(attachment.name)) {
        romFileNames.push(attachment.name);
      }
    });

    if (romFileNames.length > 0) {
      await message.channel.send({
        content: `${message.author}: Do not post links to ROM files or other copyrighted content.\n` +
          `The ${moderator} team has been alerted to this incident.\n` +
          `The potentially problematic file(s) in question were:\n- ${romFileNames.join('\n- ')}`
      });

      await message.delete();

      if (options.alertsChannelId) {
        const alertsChannel = await message.guild.channels.fetch(options.alertsChannelId);
        await alertsChannel.send({
          content: `${message.author} has just posted a potentially pirated file ` +
            `in ${message.channel}.\n**Problem files:**\n- ${romFileNames.join('\n- ')}`
        });
      }
    }
  } catch (error) {
    generalErrorHandler(error);
  }
};
