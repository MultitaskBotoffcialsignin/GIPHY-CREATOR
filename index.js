require("dotenv").config();
const {
  Client, GatewayIntentBits, AttachmentBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder,
  PermissionFlagsBits, REST, Routes
} = require("discord.js");
const { createCanvas } = require("@napi-rs/canvas");
const { GIFEncoder, quantize, applyPalette } = require("gifenc");
const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const http = require("node:http");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const DATA_DIR = path.join(__dirname, "data");
const USER_FILE = path.join(DATA_DIR, "users.json");
const SERVER_FILE = path.join(DATA_DIR, "servers.json");
fs.mkdirSync(DATA_DIR, { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return fallback; }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
const users = readJson(USER_FILE, {});
const servers = readJson(SERVER_FILE, {});

const COLORS = {
  blue: "#2471e8", red: "#e74c3c", green: "#2ecc71",
  purple: "#8e44ad", orange: "#e67e22", black: "#111111"
};
const randomItem = (items) => items[Math.floor(Math.random() * items.length)];

async function makeGif({ text, background, color, speed, width, height }) {
  const encoder = GIFEncoder();
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const fontSize = Math.min(58, Math.floor(width / Math.max(5, text.length) * 1.55));

  for (let frame = 0; frame < 16; frame++) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    const pulse = 1 + Math.sin((frame / 16) * Math.PI * 2) * 0.07;
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(pulse, pulse);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#000000";
    ctx.strokeText(text, 0, 0, width - 36);
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0, width - 36);
    ctx.restore();

    const pixels = ctx.getImageData(0, 0, width, height).data;
    const palette = quantize(pixels, 256);
    const indexedPixels = applyPalette(pixels, palette);
    encoder.writeFrame(indexedPixels, width, height, {
      palette,
      delay: speed,
      repeat: 0
    });
  }

  encoder.finish();
  return Buffer.from(encoder.bytes());
}

function getGiphy(pathname, query = "", limit = 5) {
  const key = process.env.GIPHY_API_KEY;
  if (!key) return Promise.reject(new Error("GIPHY_API_KEY is not configured."));
  const url = new URL(`https://api.giphy.com/v1/gifs/${pathname}`);
  url.searchParams.set("api_key", key);
  url.searchParams.set("limit", String(limit));
  if (query) url.searchParams.set("q", query);
  url.searchParams.set("rating", "pg");
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          const items = Array.isArray(parsed.data) ? parsed.data : [parsed.data].filter(Boolean);
          const gifs = items.map(item => ({
            id: item.id,
            title: item.title || "GIPHY GIF",
            url: item.images?.original?.url,
            pageUrl: item.url
          })).filter(item => item.url);
          if (!gifs.length) return reject(new Error("GIPHY did not find any GIFs."));
          resolve(gifs);
        } catch (error) { reject(error); }
      });
    }).on("error", reject);
  });
}

function makeGiphyEmbeds(gifs, heading) {
  return gifs.map((gif, index) => new EmbedBuilder()
    .setColor(0x2471e8)
    .setTitle(`${index + 1}. ${gif.title}`)
    .setURL(gif.pageUrl)
    .setDescription(`**GIPHY ID:** \`${gif.id}\``)
    .setImage(gif.url)
    .setFooter({ text: heading }));
}

function saveUserGif(userId, entry) {
  users[userId] ??= [];
  users[userId].unshift(entry);
  users[userId] = users[userId].slice(0, 30);
  writeJson(USER_FILE, users);
}
function saveServerGif(guildId, entry) {
  servers[guildId] ??= [];
  servers[guildId].unshift(entry);
  writeJson(SERVER_FILE, servers);
}

const commands = [
  new SlashCommandBuilder().setName("creategif").setDescription("Create an animated text GIF")
    .addStringOption(o => o.setName("text").setDescription("Text to animate").setRequired(true).setMaxLength(35))
    .addStringOption(o => o.setName("style").setDescription("GIF style").setRequired(true)
      .addChoices({name:"Reaction",value:"reaction"},{name:"Meme",value:"meme"},{name:"Animated text",value:"text"},{name:"Surprise me",value:"surprise"}))
    .addStringOption(o => o.setName("background").setDescription("Background color")
      .addChoices(...Object.keys(COLORS).map(k => ({name:k,value:k}))))
    .addStringOption(o => o.setName("text_color").setDescription("Text color")
      .addChoices({name:"White",value:"white"},{name:"Yellow",value:"yellow"},{name:"Cyan",value:"cyan"},{name:"Pink",value:"pink"})),
  new SlashCommandBuilder().setName("mygif").setDescription("View GIFs you created with this bot"),
  new SlashCommandBuilder().setName("servergif").setDescription("View GIFs approved for this server"),
  new SlashCommandBuilder().setName("randomgif").setDescription("Get a random GIF from GIPHY"),
  new SlashCommandBuilder().setName("trendinggifs").setDescription("Show trending GIFs from GIPHY"),
  new SlashCommandBuilder().setName("gifind").setDescription("Search GIPHY for GIFs")
    .addStringOption(o => o.setName("query").setDescription("What GIF should I find?").setRequired(true).setMaxLength(80)),
  new SlashCommandBuilder().setName("approvegif").setDescription("Approve a GIF for this server (Manage Server)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addAttachmentOption(o => o.setName("gif").setDescription("GIF file to approve").setRequired(true))
    .addStringOption(o => o.setName("name").setDescription("Optional name for the GIF").setMaxLength(60)),
  new SlashCommandBuilder().setName("removegif").setDescription("Remove a GIF from this server's library (Manage Server)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption(o => o.setName("number").setDescription("Number shown in /servergif").setRequired(true).setMinValue(1))
].map(c => c.toJSON());

client.once("ready", () => console.log(`GIPHY CREATOR online as ${client.user.tag}`));

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  try {
    const { commandName } = interaction;
    if (commandName === "creategif") {
      await interaction.deferReply();
      const chosenStyle = interaction.options.getString("style");
      const surprise = chosenStyle === "surprise";
      const text = surprise
        ? randomItem(["WOW!", "NO WAY!", "LOL!", "BRUH!", "LET'S GO!", "OMG!"])
        : interaction.options.getString("text");
      const bgName = surprise ? randomItem(Object.keys(COLORS)) : (interaction.options.getString("background") || "black");
      const textColors = ["#ffffff", "#ffe600", "#00e5ff", "#ff69b4"];
      const colorName = interaction.options.getString("text_color");
      const color = surprise ? randomItem(textColors) : ({white:"#ffffff",yellow:"#ffe600",cyan:"#00e5ff",pink:"#ff69b4"}[colorName || "white"]);
      const speed = surprise ? randomItem([70,100,140,180]) : 110;
      const width = 480, height = 240;
      const buffer = await makeGif({ text, background: COLORS[bgName], color, speed, width, height });
      const fileName = `giphy-${Date.now()}.gif`;
      const attachment = new AttachmentBuilder(buffer, { name: fileName });
      saveUserGif(interaction.user.id, { name: text, url: null, createdAt: new Date().toISOString(), style: surprise ? "surprise" : chosenStyle });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("gif_again").setLabel("Surprise me again").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("gif_done").setLabel("Done").setStyle(ButtonStyle.Secondary)
      );
      await interaction.editReply({ content: `Here's your animated GIF, **${text}**!`, files: [attachment], components: [row] });
      return;
    }
    if (commandName === "mygif") {
      const list = users[interaction.user.id] || [];
      if (!list.length) return interaction.reply({content:"You haven't created any GIFs with me yet. Try /creategif!",ephemeral:true});
      const embed = new EmbedBuilder().setTitle("Your GIF history").setColor(0x2471e8)
        .setDescription(list.slice(0,10).map((g,i)=>`**${i+1}.** ${g.name} — <t:${Math.floor(new Date(g.createdAt).getTime()/1000)}:R>`).join("\n"));
      return interaction.reply({embeds:[embed],ephemeral:true});
    }
    if (commandName === "servergif") {
      if (!interaction.guildId) return interaction.reply({content:"Use this command inside a server.",ephemeral:true});
      const list = servers[interaction.guildId] || [];
      if (!list.length) return interaction.reply({content:"No GIFs have been approved for this server yet.",ephemeral:true});
      const embed = new EmbedBuilder().setTitle(`${interaction.guild.name} GIF library`).setColor(0x2471e8)
        .setDescription(list.slice(0,15).map((g,i)=>`**${i+1}. ${g.name}**\n${g.url}`).join("\n\n"));
      return interaction.reply({embeds:[embed]});
    }
    if (commandName === "approvegif") {
      if (!interaction.guildId) return interaction.reply({content:"Use this command inside a server.",ephemeral:true});
      const file = interaction.options.getAttachment("gif");
      if (!file.name.toLowerCase().endsWith(".gif") && file.contentType !== "image/gif")
        return interaction.reply({content:"Please attach a real .gif file.",ephemeral:true});
      saveServerGif(interaction.guildId,{name:interaction.options.getString("name") || file.name,url:file.url,approvedBy:interaction.user.id});
      return interaction.reply({content:"GIF approved and added to this server's library!"});
    }
    if (commandName === "removegif") {
      const list = servers[interaction.guildId] || [];
      const number = interaction.options.getInteger("number");
      if (!list[number-1]) return interaction.reply({content:"That GIF number doesn't exist. Check /servergif.",ephemeral:true});
      const removed = list.splice(number-1,1)[0];
      writeJson(SERVER_FILE,servers);
      return interaction.reply({content:`Removed **${removed.name}** from this server's GIF library.`});
    }
    if (commandName === "randomgif") {
      await interaction.deferReply();
      const results = await getGiphy("random");
      return interaction.editReply({embeds: makeGiphyEmbeds(results, "Random GIPHY result")});
    }
    if (commandName === "trendinggifs") {
      await interaction.deferReply();
      const results = await getGiphy("trending");
      return interaction.editReply({embeds: makeGiphyEmbeds(results, "Trending on GIPHY")});
    }
    if (commandName === "gifind") {
      await interaction.deferReply();
      const query = interaction.options.getString("query", true);
      // Ask GIPHY for a larger set, then choose one strong match.
      // GIPHY already orders search results by relevance; title matching
      // helps promote results whose names directly match the user's query.
      const results = await getGiphy("search", query, 25);
      const terms = query.toLowerCase().split(/\\s+/).filter(Boolean);
      const best = results
        .map((gif, index) => {
          const title = gif.title.toLowerCase();
          const matchedTerms = terms.filter(term => title.includes(term)).length;
          const exactPhrase = title.includes(query.toLowerCase()) ? 5 : 0;
          return { gif, score: exactPhrase + matchedTerms * 2 - index * 0.01 };
        })
        .sort((a, b) => b.score - a.score)[0].gif;
      return interaction.editReply({
        content: `Best match for **${query}**:`,
        embeds: makeGiphyEmbeds([best], `Best GIPHY match: ${query}`)
      });
    }
  } catch (error) {
    console.error(error);
    const message = "Something went wrong. Check the bot logs for details.";
    if (interaction.deferred || interaction.replied) await interaction.followUp({content:message,ephemeral:true}).catch(()=>{});
    else await interaction.reply({content:message,ephemeral:true}).catch(()=>{});
  }
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;
  if (interaction.customId === "gif_done") {
    return interaction.update({components:[]});
  }
  if (interaction.customId === "gif_again") {
    await interaction.deferUpdate();
    try {
      const text = randomItem(["WOW!", "NO WAY!", "LOL!", "BRUH!", "LET'S GO!", "OMG!"]);
      const bg = randomItem(Object.values(COLORS));
      const color = randomItem(["#ffffff","#ffe600","#00e5ff","#ff69b4"]);
      const speed = randomItem([70,100,140,180]);
      const buffer = await makeGif({text,background:bg,color,speed,width:480,height:240});
      saveUserGif(interaction.user.id,{name:text,createdAt:new Date().toISOString(),style:"surprise"});
      return interaction.editReply({content:`Surprise! **${text}**`,files:[new AttachmentBuilder(buffer,{name:`surprise-${Date.now()}.gif`})]});
    } catch (error) {
      console.error(error);
      return interaction.followUp({content:"I couldn't make that GIF. Check the bot logs.",ephemeral:true});
    }
  }
});

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("GIPHY CREATOR is running.");
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found.");
}).listen(PORT, "0.0.0.0", () => console.log(`Health server listening on port ${PORT}`));

if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
  console.error("Missing DISCORD_TOKEN or CLIENT_ID. Add both to your hosting environment.");
  process.exit(1);
}

(async () => {
  try {
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log("GIPHY CREATOR slash commands registered.");
    await client.login(process.env.DISCORD_TOKEN);
  } catch (error) {
    console.error("Startup or slash-command registration failed:", error);
    process.exit(1);
  }
})();
