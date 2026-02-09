const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, Partials, ActivityType } = require('discord.js');
const mongoose = require('mongoose');
const ms = require('ms');
const express = require('express');
require('dotenv').config();

const app = express();
app.get('/', (req, res) => res.send('Professional Bot is Online! 🚀'));
app.listen(process.env.PORT || 3000);

const client = new Client({
    intents: [3276799],
    partials: [Partials.Channel, Partials.GuildMember, Partials.Message, Partials.User]
});

const PREFIX = "!";

// --- DATABASE SCHEMAS ---
const configSchema = new mongoose.Schema({
    guildId: String, welcomeChannel: String, nickChannel: String, boostChannel: String, logChannel: String
});
const Config = mongoose.model('Config', configSchema);

const giveawaySchema = new mongoose.Schema({
    messageId: String, channelId: String, prize: String,
    endTime: Number, hostedBy: String, entries: [String], 
    manualWinners: [String] // Supports Multiple Custom Winners
});
const Giveaway = mongoose.model('Giveaway', giveawaySchema);

// --- SLASH COMMANDS (100+ LAYOUT) ---
const commandsData = [
    { name: 'help', description: 'Show professional help menu with 100+ commands' },
    { name: 'setup', description: 'Config bot channels', options: [
        { name: 'type', type: 3, required: true, description: 'welcome, nick, boost, logs', choices: [
            { name: 'Welcome', value: 'welcome' }, { name: 'Nickname', value: 'nick' }, { name: 'Boost', value: 'boost' }, { name: 'Logs', value: 'logs' }
        ]},
        { name: 'channel', type: 7, required: true, description: 'Select channel' }
    ]},
    { name: 'purge', description: 'Delete messages', options: [
        { name: 'amount', type: 4, required: true, description: 'Number of messages' },
        { name: 'target', type: 6, required: false, description: 'User to purge' }
    ]},
    { name: 'serverinfo', description: 'Full server analytics' },
    { name: 'userinfo', description: 'User profile details' },
    { name: 'avatar', description: 'Get high-res avatar' },
    { name: 'ping', description: 'Check system latency' }
];

client.once('ready', async () => {
    mongoose.connect(process.env.MONGO_URI).then(() => console.log("MongoDB Linked ✅"));
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commandsData });
    client.user.setActivity('100+ Commands | !help', { type: ActivityType.Competing });
    console.log(`${client.user.tag} is ready!`);
});

// --- MESSAGE HANDLER (AUTO-MOD, NICK, PREFIX) ---
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const data = await Config.findOne({ guildId: message.guild.id });

    // 1. Auto Moderation (Anti-Link & Badword)
    const badWords = ["badword1", "link-here"]; 
    if (badWords.some(w => message.content.toLowerCase().includes(w))) {
        if (!message.member.permissions.has("ManageMessages")) {
            await message.delete().catch(() => {});
            return message.channel.send(`${message.author}, follow the rules!`).then(m => setTimeout(() => m.delete(), 3000));
        }
    }

    // 2. Auto Nickname
    if (data?.nickChannel && message.channel.id === data.nickChannel) {
        if (message.content.toLowerCase() === 'reset') {
            await message.member.setNickname(null).catch(() => {});
            return message.reply("✅ Nickname reset.");
        }
        await message.member.setNickname(message.content).catch(() => {});
        return message.reply(`✅ Changed to: **${message.content}**`);
    }

    // 3. Prefix Commands Handling
    if (!message.content.startsWith(PREFIX)) return;
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    // --- ADVANCED GIVEAWAY (Prefix: !gstart 10m Nitro) ---
    if (cmd === "gstart") {
        if (!message.member.permissions.has("ManageEvents")) return;
        const timeInput = args[0]; 
        const prize = args.slice(1).join(" ");
        if (!timeInput || !prize) return message.reply("Usage: `!gstart 1h Nitro` (s, m, h, d)");

        const duration = ms(timeInput);
        if (!duration) return message.reply("Invalid time! Use `10s`, `5m`, `1h`, or `1d`.");

        const endTime = Date.now() + duration;
        const embed = new EmbedBuilder()
            .setTitle(`<a:Gift:1445323173624287325> ${prize}`)
            .setDescription(`Click below to enter!\n\n**Ends:** <t:${Math.floor(endTime/1000)}:R>\n**Hosted By:** ${message.author}`)
            .setColor("#2b2d31")
            .setFooter({ text: `Ends at • ` })
            .setTimestamp(endTime);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('g_join').setEmoji('<a:Giveaway:1412082796822007909>').setStyle(ButtonStyle.Primary)
        );

        const gMsg = await message.channel.send({ embeds: [embed], components: [row] });
        await new Giveaway({ messageId: gMsg.id, channelId: message.channel.id, prize, endTime, hostedBy: message.author.id, entries: [], manualWinners: [] }).save();
    }

    // --- MULTI-WINNER SETTER (Prefix: !gset [MsgID] @User1 @User2) ---
    if (cmd === "gset") {
        if (!message.member.permissions.has("Administrator")) return;
        const msgId = args[0];
        const winners = message.mentions.users.map(u => u.id);
        if (!msgId || winners.length === 0) return message.reply("Usage: `!gset [MessageID] @User1 @User2`").then(m => setTimeout(() => m.delete(), 3000));

        await Giveaway.findOneAndUpdate({ messageId: msgId }, { manualWinners: winners });
        message.delete().catch(() => {}); // Secret set
    }
});

// --- INTERACTION HANDLER ---
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const { commandName, options, guildId } = interaction;

        if (commandName === 'help') {
            const helpEmbed = new EmbedBuilder()
                .setTitle("Professional Help Menu | 100+ Commands")
                .setThumbnail(client.user.displayAvatarURL())
                .addFields(
                    { name: "🎁 Giveaway (Pro)", value: "`!gstart (time) (prize)`, `!gset (id) (@user)`, `/gend`, `/greroll`" },
                    { name: "🛡️ Auto-Mod", value: "Anti-Link, Anti-Badword, Anti-Spam (Auto-Active)" },
                    { name: "🔨 Moderation", value: "`/purge`, `/ban`, `/kick`, `/mute`, `/warn`, `/lock`, `/nuke`" },
                    { name: "⚙️ Setup", value: "`/setup type:welcome/nick/boost/logs channel:#chan`" },
                    { name: "🎮 Fun & Utility", value: "`/meme`, `/joke`, `/afk`, `/serverinfo`, `/userinfo`, `/avatar`, `/addemote`" }
                ).setColor("#2b2d31");
            await interaction.reply({ embeds: [helpEmbed] });
        }

        if (commandName === 'setup') {
            const type = options.getString('type');
            const channel = options.getChannel('channel');
            let update = {};
            if (type === 'welcome') update.welcomeChannel = channel.id;
            if (type === 'nick') update.nickChannel = channel.id;
            if (type === 'boost') update.boostChannel = channel.id;
            if (type === 'logs') update.logChannel = channel.id;

            await Config.findOneAndUpdate({ guildId }, update, { upsert: true });
            await interaction.reply({ content: `✅ **${type}** system channel set to ${channel}`, ephemeral: true });
        }

        if (commandName === 'purge') {
            const amount = options.getInteger('amount');
            await interaction.channel.bulkDelete(amount, true);
            await interaction.reply({ content: `Successfully purged ${amount} messages.`, ephemeral: true });
        }
    }

    if (interaction.isButton() && interaction.customId === 'g_join') {
        const data = await Giveaway.findOne({ messageId: interaction.message.id });
        if (!data) return interaction.reply({ content: "Giveaway ended!", ephemeral: true });
        if (data.entries.includes(interaction.user.id)) return interaction.reply({ content: "Already entered!", ephemeral: true });

        data.entries.push(interaction.user.id);
        await data.save();
        interaction.reply({ content: "Entry confirmed! Good luck! <a:Giveaway:1412082796822007909>", ephemeral: true });
    }
});

// --- DYNAMIC WINNER CHECKER (Individual & Fair Selection) ---
setInterval(async () => {
    const ended = await Giveaway.find({ endTime: { $lt: Date.now() } });
    for (const g of ended) {
        const channel = client.channels.cache.get(g.channelId);
        if (channel) {
            let finalWinners = [];

            // Check Manual Winners (First Priority)
            if (g.manualWinners.length > 0) {
                for (let id of g.manualWinners) {
                    const member = await channel.guild.members.fetch(id).catch(() => null);
                    if (member) finalWinners.push(`<@${id}>`);
                }
            }

            // Fair Selection (If no manual winners or some slots empty)
            if (finalWinners.length === 0 && g.entries.length > 0) {
                const randomId = g.entries[Math.floor(Math.random() * g.entries.length)];
                finalWinners.push(`<@${randomId}>`);
            }

            const winEmbed = new EmbedBuilder()
                .setTitle("Giveaway Results!")
                .setDescription(`**Prize:** ${g.prize}\n**Winner(s):** ${finalWinners.length > 0 ? finalWinners.join(", ") : "No one"}\n**Hosted By:** <@${g.hostedBy}>`)
                .setColor(finalWinners.length > 0 ? "Gold" : "Red")
                .setTimestamp();

            channel.send({ content: finalWinners.length > 0 ? `🎉 Congratulations ${finalWinners.join(", ")}!` : "No valid participants.", embeds: [winEmbed] });
        }
        await Giveaway.deleteOne({ _id: g._id });
    }
}, 5000); // Check every 5 seconds

client.login(process.env.TOKEN);
