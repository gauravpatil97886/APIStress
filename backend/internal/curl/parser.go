package curl

import (
	"fmt"
	"strings"
	"unicode"

	"github.com/choicetechlab/choicehammer/internal/engine"
)

// Parse parses a curl command string into an engine.HTTPRequest.
// Supports: -X/--request, -H/--header, -d/--data/--data-raw/--data-binary,
// -u/--user, --url, -L (ignored), -k (ignored), --compressed (ignored).
func Parse(input string) (*engine.HTTPRequest, error) {
	tokens, err := tokenize(input)
	if err != nil {
		return nil, err
	}
	if len(tokens) == 0 {
		return nil, fmt.Errorf("empty input")
	}
	if strings.EqualFold(tokens[0], "curl") {
		tokens = tokens[1:]
	}
	req := &engine.HTTPRequest{
		Method:  "GET",
		Headers: map[string]string{},
		Timeout: 30000,
	}
	for i := 0; i < len(tokens); i++ {
		t := tokens[i]
		switch {
		case t == "-X" || t == "--request":
			i++
			if i < len(tokens) {
				req.Method = strings.ToUpper(tokens[i])
			}
		case t == "-H" || t == "--header":
			i++
			if i < len(tokens) {
				k, v, ok := splitHeader(tokens[i])
				if ok {
					req.Headers[k] = v
				}
			}
		case t == "-d" || t == "--data" || t == "--data-raw" || t == "--data-binary" || t == "--data-ascii":
			i++
			if i < len(tokens) {
				if req.Body != "" {
					req.Body += "&" + tokens[i]
				} else {
					req.Body = tokens[i]
				}
				if req.Method == "GET" {
					req.Method = "POST"
				}
			}
		case t == "-u" || t == "--user":
			i++
			if i < len(tokens) {
				req.Headers["Authorization"] = "Basic " + base64(tokens[i])
			}
		case t == "--url":
			i++
			if i < len(tokens) {
				req.URL = tokens[i]
			}
		case t == "-A" || t == "--user-agent":
			i++
			if i < len(tokens) {
				req.Headers["User-Agent"] = tokens[i]
			}
		case t == "-e" || t == "--referer":
			i++
			if i < len(tokens) {
				req.Headers["Referer"] = tokens[i]
			}
		case t == "-L" || t == "--location" || t == "-k" || t == "--insecure" || t == "--compressed" || t == "-s" || t == "--silent" || t == "-i" || t == "--include" || t == "-v" || t == "--verbose":
			// no-op
		case strings.HasPrefix(t, "-"):
			// unknown flag; if next token isn't a flag, skip it too
			if i+1 < len(tokens) && !strings.HasPrefix(tokens[i+1], "-") {
				i++
			}
		default:
			if req.URL == "" {
				req.URL = t
			}
		}
	}
	if req.URL == "" {
		return nil, fmt.Errorf("no URL found in curl command")
	}
	return req, nil
}

func splitHeader(h string) (string, string, bool) {
	idx := strings.IndexByte(h, ':')
	if idx <= 0 {
		return "", "", false
	}
	return strings.TrimSpace(h[:idx]), strings.TrimSpace(h[idx+1:]), true
}

// tokenize handles single quotes, double quotes, backslash continuations,
// and \\\n line continuations common in copied browser curl commands.
func tokenize(input string) ([]string, error) {
	input = strings.ReplaceAll(input, "\\\n", " ")
	input = strings.ReplaceAll(input, "\\\r\n", " ")

	var tokens []string
	var buf strings.Builder
	inSingle, inDouble := false, false
	escape := false
	flush := func() {
		if buf.Len() > 0 {
			tokens = append(tokens, buf.String())
			buf.Reset()
		}
	}
	for _, r := range input {
		switch {
		case escape:
			buf.WriteRune(r)
			escape = false
		case r == '\\' && !inSingle:
			escape = true
		case r == '\'' && !inDouble:
			inSingle = !inSingle
		case r == '"' && !inSingle:
			inDouble = !inDouble
		case unicode.IsSpace(r) && !inSingle && !inDouble:
			flush()
		default:
			buf.WriteRune(r)
		}
	}
	if inSingle || inDouble {
		return nil, fmt.Errorf("unterminated quote")
	}
	flush()
	return tokens, nil
}

// minimal base64 to avoid an import cycle / extra dep
func base64(s string) string {
	const tbl = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
	src := []byte(s)
	var out strings.Builder
	for i := 0; i < len(src); i += 3 {
		var b [3]byte
		n := copy(b[:], src[i:])
		out.WriteByte(tbl[b[0]>>2])
		out.WriteByte(tbl[((b[0]&0x03)<<4)|(b[1]>>4)])
		if n > 1 {
			out.WriteByte(tbl[((b[1]&0x0f)<<2)|(b[2]>>6)])
		} else {
			out.WriteByte('=')
		}
		if n > 2 {
			out.WriteByte(tbl[b[2]&0x3f])
		} else {
			out.WriteByte('=')
		}
	}
	return out.String()
}
