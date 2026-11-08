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
          <tr><td><kbd>T</kbd></td><td>Open / close the AI tutor</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>Close the AI tutor</td></tr>
        </tbody></table>
      </div>
      <div className="card">
        <h2>How it works</h2>
        <p><strong>Question bank.</strong> All 3,770 official College Board SAT questions (1,925 Math, 1,845 Reading &amp; Writing) are stored locally with their answer keys and explanations, so browsing and practice work completely offline.</p>
        <p><strong>Practice.</strong> Choose a section, topics and difficulty. In adaptive mode the difficulty of each topic moves up after a run of correct answers and down after misses. Check each answer to see the official explanation; ask the AI tutor for hints or a step-by-step solution.</p>
        <p><strong>AI features</strong> (question generation, solver, session review, tutor) need an LLM API key and an internet connection. Enter the key in Settings. AI-generated questions are always labelled.</p>
        <p><strong>Calculator.</strong> The embedded Desmos graphing calculator is the same one used on the digital SAT. It needs a Desmos API key (free for non-commercial use) and a connection. Its state is kept per question while the app runs.</p>
        <p><strong>Wine.</strong> The Windows build runs under Wine on Linux. If the window stays blank, start it with <code>wine DrillSAT-1.1.0-portable.exe --disable-gpu --no-sandbox</code>. See README.md for details.</p>
      </div>
    </div>
  );
}
