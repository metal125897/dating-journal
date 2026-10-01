// Simple provider constraint verified against the free API. Complex nested
// schemas exceeded the request timeout; analytical results use local validation.
export const TAG_RESPONSE_FORMAT={type:'json_schema',schema:{type:'object',properties:{tags:{type:'array',items:{type:'string',enum:['контакт','напряжение','поступок','договорённость','рефлексия']},maxItems:5}},required:['tags'],additionalProperties:false},strict:true};
