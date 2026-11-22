require("dotenv").config();
const { REST, Routes } = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");

if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
  console.error("Set DISCORD_TOKEN and CLIENT_ID before registering commands.");
  process.exit(1);
}
const commands = [
  new (require("discord.js").SlashCommandBuilder)()
    .setName("creategif").setDescription("Create an animated text GIF")
    .addStringOption(o=>o.setName("text").setDescription("Text to animate").setRequired(true).setMaxLength(35))
    .addStringOption(o=>o.setName("style").setDescription("GIF style").setRequired(true).addChoices(
      {name:"Reaction",value:"reaction"},{name:"Meme",value:"meme"},{name:"Animated text",value:"text"},{name:"Surprise me",value:"surprise"}))
    .addStringOption(o=>o.setName("background").setDescription("Background color").addChoices(
      ...["blue","red","green","purple","orange","black"].map(v=>({name:v,value:v}))))
    .addStringOption(o=>o.setName("text_color").setDescription("Text color").addChoices(
      {name:"White",value:"white"},{name:"Yellow",value:"yellow"},{name:"Cyan",value:"cyan"},{name:"Pink",value:"pink"})),
  new (require("discord.js").SlashCommandBuilder)().setName("mygif").setDescription("View GIFs you created"),
  new (require("discord.js").SlashCommandBuilder)().setName("servergif").setDescription("View GIFs approved for this server"),
  new (require("discord.js").SlashCommandBuilder)().setName("randomgif").setDescription("Get a random GIF from GIPHY"),
  new (require("discord.js").SlashCommandBuilder)().setName("trendinggifs").setDescription("Show trending GIFs from GIPHY"),
  new (require("discord.js").SlashCommandBuilder)().setName("gifind").setDescription("Search GIPHY for GIFs")
    .addStringOption(o=>o.setName("query").setDescription("What GIF should I find?").setRequired(true).setMaxLength(80)),
  new (require("discord.js").SlashCommandBuilder)().setName("approvegif").setDescription("Approve a GIF for this server")
    .setDefaultMemberPermissions(require("discord.js").PermissionFlagsBits.ManageGuild)
    .addAttachmentOption(o=>o.setName("gif").setDescription("GIF file to approve").setRequired(true))
    .addStringOption(o=>o.setName("name").setDescription("Optional name").setMaxLength(60)),
  new (require("discord.js").SlashCommandBuilder)().setName("removegif").setDescription("Remove a GIF from this server")
    .setDefaultMemberPermissions(require("discord.js").PermissionFlagsBits.ManageGuild)
    .addIntegerOption(o=>o.setName("number").setDescription("Number shown in /servergif").setRequired(true).setMinValue(1))
].map(command=>command.toJSON());

const rest = new REST({version:"10"}).setToken(process.env.DISCORD_TOKEN);
(async()=>{
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID),{body:commands});
    console.log("GIPHY CREATOR slash commands registered.");
  } catch(error) {
    console.error("Command registration failed:",error);
    process.exit(1);
  }
})();
