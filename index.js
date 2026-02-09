const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, Partials, ActivityType } = require('discord.js');
const ms = require('ms');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('Advanced Bot with Spam Whitelist is Online! 🚀'));
app.listen(process.env.PORT || 3000);

const client = new Client({
    intents: [3276799],
    partials: [Partials.Channel, Partials.GuildMember, Partials.Message, Partials.User]
});

const PREFIX = "!";

// --- IN-MEMORY STORAGE ---
let serverConfigs = {}; 
let giveaways = {};    
let afkUsers = new Map();
let messageLog = new Map(); 
let whitelistedChannels = new Set(); // Spam Whitelist Storage

// --- COMMANDS DATA ---
const commandsData = [
    { name: 'help', description: 'Show all professional commands' },
    { name: 'setup', description: 'Config bot channels', options: [
        { name: 'type', type: 3, required: true, description: 'welcome, nick, boost', choices: [
            { name: 'Welcome', value: 'welcome' }, { name: 'Nickname', value: 'nick' }, { name: 'Boost', value: 'boost' }
        ]},
        { name: 'channel', type: 7, required: true, description: 'Select channel' }
    ]},
    { name: 'whitelist', description: 'Manage spam whitelist', options: [
        { name: 'action', type: 3, required: true, description: 'add or remove', choices: [{ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' }]},
        { name: 'channel', type: 7, required: true, description: 'Select channel' }
    ]},
    { name: 'purge', description: 'Advanced delete messages', options: [{ name: 'amount', type: 4, required: true, description: '1-100' }]},
    { name: 'addemote', description: 'Add emoji via URL', options: [{ name: 'url', type: 3, required: true }, { name: 'name', type: 3, required: true }]},
    { name: 'serverinfo', description: 'Detailed server stats' }
];

client.once('ready', async () => {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commandsData });
    console.log(`${client.user.tag} is Live! ✅`);
});

// --- MESSAGE HANDLER (AUTO-MOD + ANTI-SPAM) ---
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // --- ANTI-SPAM SYSTEM WITH WHITELIST ---
    if (!whitelistedChannels.has(message.channel.id)) {
        const now = Date.now();
        const userLog = messageLog.get(message.author.id) || [];
        userLog.push(now);
        const recent = userLog.filter(time => now - time < 5000);
        messageLog.set(message.author.id, recent);

        if (recent.length > 5) { // 5 messages in 5 seconds
            if (!message.member.permissions.has("ManageMessages")) {
                await message.delete().catch(() => {});
                return message.channel.send(`🚫 ${message.author}, Stop spamming here! Use whitelisted channels for spam.`).then(m => setTimeout(() => m.delete(), 3000));
            }
        }
    }

    // --- AFK & PREFIX LOGIC ---
    if (afkUsers.has(message.author.id)) {
        afkUsers.delete(message.author.id);
        message.reply("👋 AFK removed.").then(m => setTimeout(() => m.delete(), 3000));
    }

    if (!message.content.startsWith(PREFIX)) return;
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    // Giveaway Logic
    if (cmd === "gstart") {
        if (!message.member.permissions.has("ManageEvents")) return;
        const time = args[0]; const prize = args.slice(1).join(" ");
        const duration = ms(time || "");
        if (!duration || !prize) return message.reply("Usage: `!gstart 1h Nitro` ");
        const endTime = Date.now() + duration;

        const embed = new EmbedBuilder()
            .setTitle(`🎉 GIVEAWAY: ${prize}`)
            .setDescription(`বাটনে ক্লিক করে জয়েন করো!\nEnds: <t:${Math.floor(endTime/1000)}:R>\nHosted: ${message.author}`)
            .setColor("Gold");

        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('g_join').setEmoji('🎉').setStyle(ButtonStyle.Primary));
        const gMsg = await message.channel.send({ embeds: [embed], components: [row] });
        giveaways[gMsg.id] = { prize, endTime, entries: [], manualWinners: [], channelId: message.channel.id };
    }

    if (cmd === "gset") {
        if (!message.member.permissions.has("Administrator")) return;
        const msgId = args[0];
        const winners = message.mentions.users.map(u => u.id);
        if (giveaways[msgId] && winners.length > 0) {
            giveaways[msgId].manualWinners = winners;
            message.delete().catch(() => {});
        }
    }
});

// --- INTERACTION HANDLER ---
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const { commandName, options } = interaction;

        // Whitelist Command
        if (commandName === 'whitelist') {
            if (!interaction.member.permissions.has("Administrator")) return interaction.reply("Only Admins can do this!");
            const action = options.getString('action');
            const channel = options.getChannel('channel');

            if (action === 'add') {
                whitelistedChannels.add(channel.id);
                await interaction.reply(`✅ ${channel} is now **Whitelisted**. No anti-spam here!`);
            } else {
                whitelistedChannels.delete(channel.id);
                await interaction.reply(`❌ ${channel} removed from Whitelist. Anti-spam is now **Active**.`);
            }
        }

        if (commandName === 'help') {
            const embed = new EmbedBuilder()
                .setTitle("Elite Bot | Anti-Spam Whitelist Edition")
                .addFields(
                    { name: "🎁 Giveaway", value: "`!gstart`, `!gset`" },
                    { name: "🛡️ Anti-Spam", value: "`/whitelist` (Add/Remove channels from spam protection)" },
                    { name: "⚙️ Setup", value: "`/setup` (Welcome/Nick/Boost)" },
                    { name: "🔨 Mod", value: "`/purge`, `/ban`, `/mute`" }
                ).setColor("Blue");
            await interaction.reply({ embeds: [embed] });
        }
        
        // Setup & Purge logic stays the same...
        if (commandName === 'setup') {
            const type = options.getString('type');
            const channel = options.getChannel('channel');
            if (!serverConfigs[interaction.guildId]) serverConfigs[interaction.guildId] = {};
            serverConfigs[interaction.guildId][type] = channel.id;
            await interaction.reply(`✅ ${type} channel set to ${channel}`);
        }
    }

    if (interaction.isButton() && interaction.customId === 'g_join') {
        const g = giveaways[interaction.message.id];
        if (g && !g.entries.includes(interaction.user.id)) {
            g.entries.push(interaction.user.id);
            interaction.reply({ content: "Joined! 🎉", ephemeral: true });
        } else {
            interaction.reply({ content: "Already in or ended!", ephemeral: true });
        }
    }
});

// Winner logic interval...
setInterval(() => {
    for (const msgId in giveaways) {
        const g = giveaways[msgId];
        if (Date.now() > g.endTime) {
            const chan = client.channels.cache.get(g.channelId);
            if (chan) {
                let winners = g.manualWinners.length > 0 ? g.manualWinners : (g.entries.length > 0 ? [g.entries[Math.floor(Math.random() * g.entries.length)]] : []);
                chan.send(winners.length > 0 ? `🎊 Congratulations <@${winners[0]}>! You won **${g.prize}**!` : "No winner.");
            }
            delete giveaways[msgId];
        }
    }
}, 5000);

client.login(process.env.TOKEN);
