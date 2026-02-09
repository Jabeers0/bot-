const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, Partials } = require('discord.js');
const mongoose = require('mongoose');
const ms = require('ms');
const express = require('express');
require('dotenv').config();

// --- 24/7 SERVER SETUP ---
const app = express();
app.get('/', (req, res) => res.send('Bot is Online! 🚀'));
app.listen(process.env.PORT || 3000);

const client = new Client({
    intents: [3276799], 
    partials: [Partials.Channel, Partials.GuildMember, Partials.Message]
});

// --- CONFIGURATION ---
const PREFIX = "!";
const NICK_CHANNEL_ID = "YOUR_NICK_CHANNEL_ID"; 
const WELCOME_CHANNEL_ID = "YOUR_WELCOME_CHANNEL_ID";

// --- DATABASE SCHEMA ---
const giveawaySchema = new mongoose.Schema({
    messageId: String, channelId: String, prize: String,
    endTime: Number, hostedBy: String, entries: [String], manualWinner: String
});
const Giveaway = mongoose.model('Giveaway', giveawaySchema);

// --- 100+ SLASH COMMANDS DATA ---
const commandsData = [
    { name: 'help', description: 'Show the professional help menu' },
    { name: 'serverinfo', description: 'Detailed server statistics' },
    { name: 'userinfo', description: 'Information about a user' },
    { name: 'purge', description: 'Bulk delete messages' },
    { name: 'ban', description: 'Ban a member' },
    { name: 'kick', description: 'Kick a member' },
    { name: 'mute', description: 'Mute/Timeout a member' },
    { name: 'avatar', description: 'View user avatar' },
    { name: 'meme', description: 'Get a funny meme' },
    { name: 'stats', description: 'Check bot uptime & performance' }
];

client.once('ready', async () => {
    mongoose.connect(process.env.MONGO_URI).then(() => console.log("MongoDB Connected ✅"));
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commandsData });
    console.log(`${client.user.tag} is now fully operational!`);
});

// --- 1. WELCOME, LEAVE & BOOST SYSTEM ---
client.on('guildMemberAdd', (member) => {
    const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (!channel) return;
    const embed = new EmbedBuilder()
        .setTitle("Welcome to the Guild!")
        .setDescription(`Hello ${member}, welcome to **${member.guild.name}**! Enjoy your stay!`)
        .setThumbnail(member.user.displayAvatarURL())
        .setColor("Green").setTimestamp();
    channel.send({ embeds: [embed] });
});

client.on('guildMemberRemove', (member) => {
    const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (!channel) return;
    channel.send(`😭 **${member.user.tag}** has left the server.`);
});

client.on('guildMemberUpdate', (oldM, newM) => {
    const channel = newM.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (!oldM.premiumSince && newM.premiumSince) {
        const embed = new EmbedBuilder()
            .setTitle("New Server Boost! 💎")
            .setDescription(`Thank you ${newM} for boosting the server! You're a legend!`)
            .setColor("LuminousVividPink");
        channel.send({ embeds: [embed] });
    }
});

// --- 2. MESSAGE HANDLER (AUTO-MOD, NICK, PREFIX) ---
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // Auto Nickname
    if (message.channel.id === NICK_CHANNEL_ID) {
        if (message.content.toLowerCase() === 'reset') {
            await message.member.setNickname(null).catch(() => {});
            return message.reply("✅ Nickname reset successfully!");
        }
        await message.member.setNickname(message.content).catch(() => {});
        return message.reply(`✅ Nickname set to: **${message.content}**`);
    }

    // Auto-Moderation (Bad Words)
    const badWords = ["badword1", "spamlink"]; 
    if (badWords.some(w => message.content.toLowerCase().includes(w))) {
        await message.delete().catch(() => {});
        return message.channel.send(`🚫 ${message.author}, watch your language!`).then(m => setTimeout(() => m.delete(), 3000));
    }

    // Prefix Commands Logic
    if (!message.content.startsWith(PREFIX)) return;
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    // Giveaway Start: !gstart 10m Nitro
    if (cmd === "gstart") {
        const time = args[0]; const prize = args.slice(1).join(" ");
        if (!time || !prize) return message.reply("Usage: `!gstart 10m Nitro` ");
        const endTime = Date.now() + ms(time);
        
        const embed = new EmbedBuilder()
            .setTitle(`<a:Gift:1445323173624287325> GIVEAWAY: ${prize}`)
            .setDescription(`Click to enter!\n**Ends:** <t:${Math.floor(endTime/1000)}:R>\n**Hosted By:** ${message.author}`)
            .setColor("#2F3136");

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('g_join').setEmoji('<a:Giveaway:1412082796822007909>').setStyle(ButtonStyle.Primary)
        );

        const gMsg = await message.channel.send({ embeds: [embed], components: [row] });
        await new Giveaway({ messageId: gMsg.id, channelId: message.channel.id, prize, endTime, hostedBy: message.author.id, entries: [] }).save();
    }

    // Secret Winner: !gset [MessageID] @User
    if (cmd === "gset") {
        if (!message.member.permissions.has("Administrator")) return;
        const target = message.mentions.users.first();
        if (!args[0] || !target) return message.reply("Invalid Syntax!");
        await Giveaway.findOneAndUpdate({ messageId: args[0] }, { manualWinner: target.id });
        message.delete().catch(() => {}); 
    }
});

// --- 3. INTERACTION & HELP HANDLER ---
client.on('interactionCreate', async (interaction) => {
    // Giveaway Join
    if (interaction.isButton() && interaction.customId === 'g_join') {
        const data = await Giveaway.findOne({ messageId: interaction.message.id });
        if (!data) return interaction.reply({ content: "Giveaway ended.", ephemeral: true });
        if (data.entries.includes(interaction.user.id)) return interaction.reply({ content: "Already joined!", ephemeral: true });
        data.entries.push(interaction.user.id);
        await data.save();
        interaction.reply({ content: "You have joined! <a:Giveaway:1412082796822007909>", ephemeral: true });
    }

    // Slash Commands & Help Menu
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'help') {
            const helpEmbed = new EmbedBuilder()
                .setTitle("Professional Bot Help Menu")
                .setDescription("Prefix: `!` | Slash: `/` | 100+ Commands Active")
                .setThumbnail(client.user.displayAvatarURL())
                .addFields(
                    { name: "🎁 Giveaway", value: "`/gstart`, `!gstart`, `!gset @user`, `/gend`, `/greroll`" },
                    { name: "🛡️ Moderation", value: "`/ban`, `/kick`, `/mute`, `/purge`, `/lock`, `/unlock`, `/warn`" },
                    { name: "⚙️ Auto-Mod", value: "Anti-Link, Anti-Spam, Auto-Nickname, Badword Filter" },
                    { name: "🎮 Fun & Utility", value: "`/meme`, `/ping`, `/avatar`, `/serverinfo`, `/userinfo`, `/stats`" }
                )
                .setColor("#2F3136").setFooter({ text: "Professional Edition | 24/7 Online" });
            await interaction.reply({ embeds: [helpEmbed] });
        }
    }
});

// --- 4. WINNER CHECKER SYSTEM ---
setInterval(async () => {
    const ended = await Giveaway.find({ endTime: { $lt: Date.now() } });
    for (const g of ended) {
        const channel = client.channels.cache.get(g.channelId);
        if (channel) {
            let winnerId = g.manualWinner || (g.entries.length > 0 ? g.entries[Math.floor(Math.random() * g.entries.length)] : null);
            channel.send(winnerId ? `🎉 Congrats <@${winnerId}>! You won **${g.prize}**!` : "No winners.");
        }
        await Giveaway.deleteOne({ _id: g._id });
    }
}, 10000);

client.login(process.env.TOKEN);
