(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CommandPalette = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const commands = Object.freeze([
    { name:'research', label:'Research a topic', prompt:'Research this topic: ' },
    { name:'draft', label:'Draft something', prompt:'Draft this for me: ' },
    { name:'review', label:'Review text or a file', prompt:'Review this: ' },
    { name:'summarize', label:'Summarize this conversation', prompt:'Summarize this conversation, including key decisions and next steps.' },
    { name:'new', label:'Start a new conversation', action:'new' },
    { name:'project', label:'Open the active project', action:'project' }
  ]);

  function match(value) {
    const text = String(value || '');
    if (!text.startsWith('/') || /\s/.test(text)) return [];
    const query = text.slice(1).toLocaleLowerCase();
    return commands.filter(command => command.name.startsWith(query));
  }

  function get(name) {
    return commands.find(command => command.name === String(name || '').replace(/^\//, '').toLocaleLowerCase()) || null;
  }

  return { commands, match, get };
});
