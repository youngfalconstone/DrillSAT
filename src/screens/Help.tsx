export default function Help() {
  return (
    <div className="grid2">
      <div className="card">
        <h2>Keyboard shortcuts</h2>
        <table className="tbl"><tbody>
          <tr><td><kbd>A</kbd> <kbd>B</kbd> <kbd>C</kbd> <kbd>D</kbd> or <kbd>1</kbd>–<kbd>4</kbd></td><td>Select an answer choice</td></tr>
          <tr><td><kbd>Enter</kbd></td><td>Check the answer, then go to the next question</td></tr>
          <tr><td><kbd>←</kbd> <kbd>→</kbd></td><td>Previous / next question</td></tr>
          <tr><td><kbd>M</kbd></td><td>Mark / unmark for review</td></tr>
          <tr><td><kbd>G</kbd></td><td>Show / hide the Desmos graphing calculator (Math)</td></tr>
          <tr><td><kbd>R</kbd></td><td>Math reference sheet</td></tr>
          <tr><td><kbd>X</kbd></td><td>Answer eliminator: cross out choices you have ruled out</td></tr>
          <tr><td><kbd>H</kbd></td><td>Highlighter: select text to highlight it, click a highlight to remove it</td></tr>
          <tr><td><kbd>T</kbd></td><td>Open / close the AI tutor (not available during a practice test)</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>Close the AI tutor</td></tr>
        </tbody></table>
      </div>
      <div className="card">
        <h2>How it works</h2>
        <p><strong>Question bank.</strong> All 3,770 official College Board SAT questions (1,925 Math, 1,845 Reading &amp; Writing) are stored locally with their answer keys and explanations, so browsing and practice work completely offline.</p>
        <p><strong>Practice.</strong> Choose a section, topics and difficulty. In adaptive mode the difficulty of each topic moves up after a run of correct answers and down after misses. Check each answer to see the official explanation; ask the AI tutor for hints or a step-by-step solution.</p>
        <p><strong>Practice tests.</strong> Full-length, timed like the digital SAT: two modules per section, and module 2 gets harder or easier depending on module 1. Answers and explanations appear at the end, with an estimated score.</p>
        <p><strong>Estimated score.</strong> Built from College Board&apos;s score band for each official question you answer (see &ldquo;How is this estimated?&rdquo; on Home). It appears after 20 official questions in a section and is most reliable after a full practice test.</p>
        <p><strong>Spaced review.</strong> Questions you miss come back after 1, 3 and 7 days until you answer them correctly three times. Start a review from Home when questions are due.</p>
        <p><strong>Updates.</strong> The installed app updates itself from GitHub: it downloads new versions in the background and installs them when you restart. The portable app shows a download link instead.</p>
        <p><strong>AI features</strong> (question generation, solver, session review, tutor) need an LLM API key and an internet connection. Enter the key in Settings. AI-generated questions are always labelled.</p>
        <p><strong>Calculator.</strong> The embedded Desmos graphing calculator is the same one used on the digital SAT. It needs a Desmos API key (free for non-commercial use) and a connection. Its state is kept per question while the app runs.</p>
        <p><strong>Wine.</strong> The Windows build runs under Wine on Linux. If the window stays blank, start it with <code>wine DrillSAT-{'<version>'}-portable.exe --disable-gpu --no-sandbox</code>. See README.md for details.</p>
      </div>
    </div>
  );
}
