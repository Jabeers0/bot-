const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, Partials, ActivityType } = require('discord.js');
const ms = require('ms');
const express = require('express');
require('dotenv').config();

// --- 24/7 SERVER SETUP ---
const app = express();
app.get('/', (req, res) => res.send('Ultimate Bot is Alive! 🚀'));
app.listen(process.env.PORT || 3000, () => console.log("Web server is ready for UptimeRobot!"));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
    ],
    partials: [Partials.Channel, Partials.GuildMember, Partials.Message, Partials.User]
});

const PREFIX = "!";

// --- MEMORY STORAGE ---
let serverConfigs = {}; 
let giveaways = {};    
let afkUsers = new Map();
let messageLog = new Map(); 
let whitelistedChannels = new Set();

// --- COMMANDS REGISTRATION ---
const commandsData = [
    { name: 'help', description: 'Show all professional commands' },
    { name: 'setup', description: 'Config bot channels', options: [
        { name: 'type', type: 3, required: true, description: 'welcome, nick, boost', choices: [{ name: 'Welcome', value: 'welcome' }, { name: 'Nickname', value: 'nick' }, { name: 'Boost', value: 'boost' }]},
        { name: 'channel', type: 7, required: true, description: 'Select channel' }
    ]},
    { name: 'whitelist', description: 'Manage spam whitelist', options: [
        { name: 'action', type: 3, required: true, description: 'add or remove', choices: [{ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' }]},
        { name: 'channel', type: 7, required: true, description: 'Select channel' }
    ]},
    { name: 'purge', description: 'Delete messages', options: [{ name: 'amount', type: 4, required: true, description: '1-100' }]},
    { name: 'serverinfo', description: 'Full server stats' },
    { name: 'avatar', description: 'View user avatar', options: [{ name: 'user', type: 6, required: false }]}
];

client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}!`);
    
    // Slash Commands Deploy
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commandsData });
        console.log('✅ Slash Commands Registered Successfully!');
    } catch (error) {
        console.error('❌ Slash Command Error:', error);
    }

    client.user.setActivity('!help | Advanced Mode', { type: ActivityType.Watching });
});

// --- CORE HANDLER (ANTI-SPAM, GIVEAWAY, AFK) ---
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // 1. Anti-Spam Whitelist Check
    if (!whitelistedChannels.has(message.channel.id) && !message.member.permissions.has("ManageMessages")) {
        const now = Date.now();
        const userLog = messageLog.get(message.author.id) || [];
        userLog.push(now);
        const recent = userLog.filter(time => now - time < 5000);
        messageLog.set(message.author.id, recent);
        if (recent.length > 5) {
            await message.delete().catch(() => {});
            return message.channel.send(`🚫 ${message.author}, Don't spam here!`).then(m => setTimeout(() => m.delete(), 3000));
        }
    }

    // 2. AFK Recovery
    if (afkUsers.has(message.author.id)) {
        afkUsers.delete(message.author.id);
        message.reply("👋 Welcome back! AFK removed.").then(m => setTimeout(() => m.delete(), 3000));
    }

    // --- PREFIX COMMANDS ---
    if (!message.content.startsWith(PREFIX)) return;
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    // Giveaway Start
    if (cmd === "gstart") {
        if (!message.member.permissions.has("ManageEvents")) return;
        const time = args[0]; const prize = args.slice(1).join(" ");
        const duration = ms(time || "");
        if (!duration || !prize) return message.reply("Usage: `!gstart 1h Nitro` ");
        
        const endTime = Date.now() + duration;
        const embed = new EmbedBuilder()
            .setTitle(`🎉 GIVEAWAY: ${prize}`)
            .setDescription(`Entry দিতে নিচের বাটনে ক্লিক করো!\n\n**Ends:** <t:${Math.floor(endTime/1000)}:R>\n**Hosted By:** ${message.author}`)
            .setColor("#00ff00");

        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('g_join').setEmoji('🎉').setStyle(ButtonStyle.Primary));
        const gMsg = await message.channel.send({ embeds: [embed], components: [row] });
        giveaways[gMsg.id] = { prize, endTime, entries: [], manualWinners: [], channelId: message.channel.id };
    }

    // Individual Winner Set
    if (cmd === "gset") {
        if (!message.member.permissions.has("Administrator")) return;
        const msgId = args[0];
        const winners = message.mentions.users.map(u => u.id);
        if (giveaways[msgId] && winners.length > 0) {
            giveaways[msgId].manualWinners = winners;
            message.delete().catch(() => {});
            message.channel.send("✅ Winner set successfully (Secretly)!").then(m => setTimeout(() => m.delete(), 2000));
        }
    }

    if (cmd === "afk") {
        afkUsers.set(message.author.id, args.join(" ") || "Away");
        message.reply("✅ Your AFK status is now active.");
    }
});

// --- INTERACTION HANDLER ---
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const { commandName, options } = interaction;

        if (commandName === 'whitelist') {
            if (!interaction.member.permissions.has("Administrator")) return interaction.reply("Admin only!");
            const action = options.getString('action');
            const channel = options.getChannel('channel');
            action === 'add' ? whitelistedChannels.add(channel.id) : whitelistedChannels.delete(channel.id);
            await interaction.reply(`✅ Spam whitelist **${action}ed** for ${channel}`);
        }

        if (commandName === 'purge') {
            const amount = options.getInteger('amount');
            await interaction.channel.bulkDelete(amount, true);
            await interaction.reply({ content: `✅ Deleted ${amount} messages.`, ephemeral: true });
        }
        
        if (commandName === 'help') {
            await interaction.reply({ embeds: [new EmbedBuilder().setTitle("Elite Bot Help").setDescription("!gstart, !gset, /whitelist, /setup, /purge, !afk").setColor("Blue")] });
        }
    }

    if (interaction.isButton() && interaction.customId === 'g_join') {
        const g = giveaways[interaction.message.id];
        if (g && !g.entries.includes(interaction.user.id)) {
            g.entries.push(interaction.user.id);
            interaction.reply({ content: "Entry confirmed! 🎉", ephemeral: true });
        } else {
            interaction.reply({ content: "You already joined or giveaway ended!", ephemeral: true });
        }
    }
});

// --- WINNER SYSTEM ---
setInterval(() => {
    for (const msgId in giveaways) {
        const g = giveaways[msgId];
        if (Date.now() > g.endTime) {
            const chan = client.channels.cache.get(g.channelId);
            if (chan) {
                let winners = g.manualWinners.length > 0 ? g.manualWinners : (g.entries.length > 0 ? [g.entries[Math.floor(Math.random() * g.entries.length)]] : []);
                chan.send(winners.length > 0 ? `🎊 Congratulations <@${winners[0]}>! You won **${g.prize}**!` : "😔 No valid entries for the giveaway.");
            }
            delete giveaways[msgId];
        }
    }
}, 5000);

// --- EMERGENCY LOGIN CHECK ---
if (!process.env.TOKEN) {
    console.error("❌ TOKEN missing in Environment Variables!");
} else {
    client.login(process.env.TOKEN).catch(err => console.error("❌ Discord Login Failed:", err.message));
     }
