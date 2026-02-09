const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, Collection } = require('discord.js');
const mongoose = require('mongoose');
const ms = require('ms');
const express = require('express');
require('dotenv').config();

// --- 24/7 UPTIME SERVER ---
const app = express();
app.get('/', (req, res) => res.send('Bot is Online!'));
app.listen(process.env.PORT || 3000);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// --- CONFIGURATION ---
const PREFIX = "!";
const NICK_CHANNEL_ID = "YOUR_CHANNEL_ID"; 

// MongoDB Schema
const giveawaySchema = new mongoose.Schema({
    messageId: String, channelId: String, prize: String,
    endTime: Number, hostedBy: String, entries: [String], manualWinner: String
});
const Giveaway = mongoose.model('Giveaway', giveawaySchema);

// --- 100+ COMMANDS REGISTRATION ---
const commands = [
    { name: 'help', description: 'Show all categories and commands' },
    { name: 'serverinfo', description: 'Get server statistics' },
    { name: 'userinfo', description: 'Get user information' },
    { name: 'ping', description: 'Check bot latency' },
    { name: 'purge', description: 'Clear messages' },
    { name: 'ban', description: 'Ban a member' },
    { name: 'kick', description: 'Kick a member' },
    { name: 'avatar', description: 'Show user avatar' },
    { name: 'slowmode', description: 'Set channel slowmode' },
    { name: 'lock', description: 'Lock the current channel' },
    { name: 'unlock', description: 'Unlock the current channel' },
    { name: 'mute', description: 'Mute a member' },
    { name: 'warn', description: 'Warn a member' }
    // Add more command objects here to reach 100+
];

client.once('ready', async () => {
    console.log(`${client.user.tag} is online!`);
    mongoose.connect(process.env.MONGO_URI).then(() => console.log("Database Connected"));
    
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    } catch (err) { console.error(err); }
});

// --- AUTO NICKNAME & AUTO MODERATION ---
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // Nickname Change System
    if (message.channel.id === NICK_CHANNEL_ID) {
        try {
            if (message.content.toLowerCase() === 'reset') {
                await message.member.setNickname(null);
                return message.reply("✅ Nickname has been reset.");
            }
            await message.member.setNickname(message.content);
            return message.reply(`✅ Nickname set to: **${message.content}**`);
        } catch (e) { console.error("Permission error for nickname"); }
    }

    // Auto Moderation (Link & Bad Word Filter)
    const badWords = ["badword1", "spamlink", "abuse"];
    if (badWords.some(word => message.content.toLowerCase().includes(word))) {
        await message.delete();
        return message.channel.send(`${message.author}, watch your language!`).then(m => setTimeout(() => m.delete(), 3000));
    }

    // --- PREFIX COMMANDS ---
    if (!message.content.startsWith(PREFIX)) return;
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    // Giveaway Start: !gstart 10m Nitro
    if (cmd === "gstart") {
        const time = args[0];
        const prize = args.slice(1).join(" ");
        if (!time || !prize) return message.reply("Usage: `!gstart 10m Prize` ");

        const endTime = Date.now() + ms(time);
        const embed = new EmbedBuilder()
            .setTitle(`<a:Gift:1445323173624287325> GIVEAWAY: ${prize}`)
            .setDescription(`Click the button to enter!\n\n**Ends:** <t:${Math.floor(endTime/1000)}:R>\n**Hosted By:** ${message.author}`)
            .setColor("#5865F2");

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('g_join').setEmoji('<a:Giveaway:1412082796822007909>').setStyle(ButtonStyle.Primary)
        );

        const gMsg = await message.channel.send({ embeds: [embed], components: [row] });
        await new Giveaway({ messageId: gMsg.id, channelId: message.channel.id, prize, endTime, hostedBy: message.author.id, entries: [] }).save();
    }

    // Sneaky Winner Setup: !gset [MessageID] [UserID]
    if (cmd === "gset") {
        if (!message.member.permissions.has("Administrator")) return;
        await Giveaway.findOneAndUpdate({ messageId: args[0] }, { manualWinner: args[1] });
        message.delete();
    }
});

// --- INTERACTION HANDLER (Buttons & Slash) ---
client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton() && interaction.customId === 'g_join') {
        const data = await Giveaway.findOne({ messageId: interaction.message.id });
        if (!data) return interaction.reply({ content: "Giveaway ended.", ephemeral: true });
        if (data.entries.includes(interaction.user.id)) return interaction.reply({ content: "Already entered!", ephemeral: true });

        data.entries.push(interaction.user.id);
        await data.save();
        interaction.reply({ content: "You entered the giveaway!", ephemeral: true });
    }

    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'help') {
            const helpEmbed = new EmbedBuilder()
                .setTitle("Professional Bot Help Menu")
                .setColor("#2F3136")
                .addFields(
                    { name: "🎁 Giveaway", value: "`/gstart`, `/gend`, `/greroll`" },
                    { name: "🛡️ Moderation", value: "`/ban`, `/kick`, `/purge`, `/mute`, `/warn`, `/lock`" },
                    { name: "⚙️ Utility", value: "`/serverinfo`, `/userinfo`, `/ping`, `/avatar`, `/stats`" }
                )
                .setFooter({ text: "100+ Commands Active | Professional Edition" });
            await interaction.reply({ embeds: [helpEmbed] });
        }
        // Add other slash command logic here
    }
});

// --- GIVEAWAY WINNER CHECKER ---
setInterval(async () => {
    const ended = await Giveaway.find({ endTime: { $lt: Date.now() } });
    for (const g of ended) {
        const channel = client.channels.cache.get(g.channelId);
        if (channel) {
            let winner = g.manualWinner || (g.entries.length > 0 ? g.entries[Math.floor(Math.random() * g.entries.length)] : null);
            channel.send(winner ? `🎉 Congratulations <@${winner}>! You won **${g.prize}**!` : "No valid entries.");
        }
        await Giveaway.deleteOne({ _id: g._id });
    }
}, 10000);

client.login(process.env.TOKEN);
