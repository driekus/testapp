/**
 * Attach a click-based counter to a DOM element.
 * Each click increments the count and updates the element's text content.
 * @param {HTMLElement} element - The element to bind the counter to.
 */
export function setupCounter(element) {
  let counter = 0;
  /**
   * Update internal counter state and mirror it in the element label.
   * @param {number} count
   */
  const setCounter = (count) => {
    counter = count;
    element.textContent = `Count is ${counter}`;
  };
  element.addEventListener('click', () => setCounter(counter + 1));
  setCounter(0);
}
