import sanitizeHtml from 'sanitize-html'

// Custom-HTML forms run in an applicant's browser, not just the operator's, so this strips
// anything that could execute script or navigate away — <script>/<iframe>, event handler
// attributes (allow-listed per tag below, so onclick etc. are simply never allowed through),
// and non-http(s)/mailto URLs. <form> is stripped too: the page wraps the operator's markup in
// its own <form> so submissions go through applyToForm, and a nested <form> would break that.
const ALLOWED_TAGS = [
  'div', 'span', 'section', 'header', 'footer', 'nav', 'article', 'aside', 'main',
  'p', 'br', 'hr', 'b', 'strong', 'i', 'em', 'u', 'small', 'mark', 'sub', 'sup',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'a', 'img', 'figure', 'figcaption',
  'label', 'input', 'select', 'option', 'optgroup', 'textarea', 'button', 'fieldset', 'legend',
]

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions['allowedAttributes'] = {
  '*': ['class', 'id', 'style', 'aria-*', 'data-*', 'title'],
  a: ['href', 'target', 'rel'],
  img: ['src', 'alt', 'width', 'height'],
  label: ['for'],
  input: ['type', 'name', 'value', 'placeholder', 'required', 'checked', 'maxlength', 'minlength', 'pattern', 'inputmode', 'autocomplete', 'min', 'max', 'step'],
  select: ['name', 'required', 'multiple'],
  option: ['value', 'selected'],
  textarea: ['name', 'required', 'placeholder', 'rows', 'maxlength'],
  button: ['type'],
}

export function sanitizeFormHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ['http', 'https', 'mailto'],
    allowVulnerableTags: false,
    // Only <input type="image"> or <button> can act like a submit control among disallowed tags;
    // dropping <script>/<iframe>/<object>/<form> entirely (not just unwrapping) keeps their text
    // content out of the page too.
    nonTextTags: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'title'],
  })
}
